import { type EventEmitter } from 'node:events'

import type { QueuedJob } from './contracts/QueueDriver.js'
import { MaxAttemptsExceededError } from './errors/MaxAttemptsExceededError.js'
import { TimeoutExceededError } from './errors/TimeoutExceededError.js'
import type { FailedJobProvider } from './failed/FailedJobProvider.js'
import { Job } from './Job.js'
import type { QueueManager } from './QueueManager.js'

export interface WorkerOptions {
  readonly name: string
  readonly queue: string
  readonly connection: string
  readonly concurrency: number
  readonly delay: number
  readonly sleep: number
  readonly maxTries: number
  readonly maxJobs: number
  readonly maxTime: number
  readonly memory: number
  readonly timeout: number
  readonly rest: number
  readonly force: boolean
  readonly stopWhenEmpty: boolean
  readonly backoff: number | number[]
}

function parseQueues(raw: string): string[] {
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
}

export function calculateBackoff(job: Job, attempt: number): number {
  const backoff = (job.constructor as typeof Job).backoff
  if (backoff === 'exponential') {
    return Math.pow(2, attempt) * 1000
  }
  if (Array.isArray(backoff)) {
    return backoff[attempt - 1] ?? backoff[backoff.length - 1] ?? 0
  }
  return backoff
}

export class Worker {
  public shouldQuit = false
  public paused = false

  private readonly beforeCallbacks: ((job: QueuedJob) => void)[] = []
  private readonly afterCallbacks: ((job: QueuedJob) => void)[] = []

  public constructor(
    private readonly manager: QueueManager,
    private readonly events: EventEmitter,
    private readonly failedJobProvider: FailedJobProvider,
    private readonly isDownForMaintenance: () => boolean,
    private readonly resetScope: () => void,
  ) {}

  public beforeProcessing(callback: (job: QueuedJob) => void): void {
    this.beforeCallbacks.push(callback)
  }

  public afterProcessing(callback: (job: QueuedJob) => void): void {
    this.afterCallbacks.push(callback)
  }

  public stop(_status = 0): void {
    this.shouldQuit = true
  }

  public kill(status = 1, signal: NodeJS.Signals = 'SIGKILL'): never {
    process.kill(process.pid, signal)

    process.exit(status)
  }

  public async sleep(seconds: number): Promise<void> {
    await new Promise<void>((resolve) => setTimeout(resolve, Math.max(0, seconds) * 1000))
  }

  public async daemon(connectionName: string, options: WorkerOptions): Promise<void> {
    const startedAt = Date.now()
    let processed = 0

    const onSignal = (): void => {
      this.shouldQuit = true
    }
    process.on('SIGTERM', onSignal)
    process.on('SIGINT', onSignal)
    process.on('SIGQUIT', onSignal)

    this.events.emit('WorkerStarted', {
      workerName: options.name,
      connection: connectionName,
      queue: options.queue,
    })

    while (!this.shouldQuit) {
      if (this.paused) {
        await this.sleep(options.sleep)
        continue
      }
      if (this.isDownForMaintenance() && !options.force) {
        await this.sleep(options.sleep)
        continue
      }
      if (options.maxTime > 0 && Date.now() - startedAt > options.maxTime * 1000) {
        break
      }
      if (options.maxJobs > 0 && processed >= options.maxJobs) {
        break
      }

      this.events.emit('Looping', { connectionName, queue: options.queue })

      let didWork = false
      for (const q of parseQueues(options.queue)) {
        const job = await this.manager.connection(connectionName).pop(q)
        if (job !== null) {
          didWork = true
          await this.process(connectionName, job, options)
          processed += 1
          this.resetScope()
          break
        }
      }

      if (!didWork) {
        if (options.stopWhenEmpty) break
        await this.sleep(options.sleep)
      } else if (options.rest > 0) {
        await new Promise<void>((r) => setTimeout(r, options.rest))
      }
    }

    this.events.emit('WorkerStopping', { workerName: options.name, status: 0 })
    await this.manager.disconnect(connectionName)
    this.events.emit('WorkerStopped', { workerName: options.name, status: 0 })

    process.off('SIGTERM', onSignal)
    process.off('SIGINT', onSignal)
    process.off('SIGQUIT', onSignal)
  }

  public async runNextJob(
    connectionName: string,
    queue: string,
    options: WorkerOptions,
  ): Promise<void> {
    const job = await this.manager.connection(connectionName).pop(queue)
    if (job === null) return
    await this.process(connectionName, job, options)
    this.resetScope()
  }

  public async process(
    connectionName: string,
    queued: QueuedJob,
    options: WorkerOptions,
  ): Promise<void> {
    for (const cb of this.beforeCallbacks) cb(queued)
    this.events.emit('JobProcessing', { connectionName, queue: queued.queue, job: queued })

    const job = Job.deserialize(queued.payload)
    job.jobId = queued.id
    job.attempts = queued.attempts

    const maxTries = Math.max(1, options.maxTries > 0 ? options.maxTries : queued.payload.maxTries)
    const retryUntil = queued.payload.retryUntil
    if (retryUntil !== null && Math.floor(Date.now() / 1000) > retryUntil) {
      await this.failJob(connectionName, queued, job, new MaxAttemptsExceededError(job))
      return
    }
    if (queued.attempts > maxTries) {
      await this.failJob(connectionName, queued, job, new MaxAttemptsExceededError(job))
      return
    }

    const timeoutSeconds = options.timeout > 0 ? options.timeout : queued.payload.timeout
    try {
      const before = job.before ? await job.before() : undefined
      if (before === false) {
        await queued.delete()
        return
      }

      const run = async (): Promise<void> => {
        await this.runMiddlewarePipeline(job)
        if (job.after) await job.after()
      }

      await (timeoutSeconds > 0
        ? Promise.race([
            run(),
            new Promise<void>((_resolve, reject) => {
              setTimeout(() => {
                reject(new TimeoutExceededError(job))
              }, timeoutSeconds * 1000)
            }),
          ])
        : run())

      await queued.delete()
      this.events.emit('JobProcessed', { connectionName, queue: queued.queue, job: queued })
      await job.dispatchNextJobInChain()
    } catch (cause) {
      const err = cause instanceof Error ? cause : new Error(String(cause))
      this.events.emit('JobExceptionOccurred', {
        connectionName,
        queue: queued.queue,
        job: queued,
        error: err,
      })
      if (queued.attempts < maxTries) {
        const backoffMs = calculateBackoff(job, queued.attempts)
        const delaySeconds = Math.ceil(backoffMs / 1000)
        this.events.emit('JobRetrying', {
          connectionName,
          queue: queued.queue,
          job: queued,
          error: err,
        })
        await queued.release(delaySeconds)
        return
      }
      await this.failJob(connectionName, queued, job, err)
    } finally {
      for (const cb of this.afterCallbacks) cb(queued)
    }
  }

  private async runMiddlewarePipeline(job: Job): Promise<void> {
    const stack = job.middlewareStack
    const run = async (idx: number): Promise<void> => {
      const mw = stack[idx]
      if (mw === undefined) {
        await job.handle()
        return
      }
      await mw.handle(job, async () => {
        await run(idx + 1)
      })
    }
    await run(0)
  }

  private async failJob(
    connectionName: string,
    queued: QueuedJob,
    job: Job,
    error: Error,
  ): Promise<void> {
    await job.failed(error)
    await this.failedJobProvider.log(
      connectionName,
      queued.queue,
      queued.payload,
      error,
      new Date(),
    )
    this.events.emit('JobFailed', { connectionName, queue: queued.queue, job: queued, error })
    await queued.delete()
  }
}
