import { describe, expect, it } from 'vitest'

import { EventEmitter } from 'node:events'

import { Worker, type WorkerOptions } from '../src/Worker.js'
import type { QueueManager } from '../src/QueueManager.js'
import type { QueuedJob } from '../src/contracts/QueueDriver.js'
import type { FailedJobProvider } from '../src/failed/FailedJobProvider.js'
import { Job } from '../src/Job.js'
import { RegisterJob } from '../src/JobRegistry.js'
import type { JobPayload } from '../src/JobPayload.js'

@RegisterJob()
class FlakyJob extends Job {
  public static override tries = 2
  public static override backoff = [1000] as const
  public static ran = 0
  public static failedHook = 0

  public constructor() {
    super()
  }

  public override async handle(): Promise<void> {
    FlakyJob.ran += 1
    throw new Error('boom')
  }

  public override async failed(_error: Error): Promise<void> {
    FlakyJob.failedHook += 1
  }
}

class MemoryFailer implements FailedJobProvider {
  public readonly logged: {
    connection: string
    queue: string
    payload: JobPayload
    message: string
  }[] = []

  public async log(
    connection: string,
    queue: string,
    payload: JobPayload,
    error: Error,
  ): Promise<string> {
    this.logged.push({ connection, queue, payload, message: error.message })
    return payload.uuid
  }

  public async find(): Promise<null> {
    return null
  }

  public async all(): Promise<never[]> {
    return []
  }

  public async forget(): Promise<boolean> {
    return false
  }

  public async flush(): Promise<number> {
    return 0
  }

  public async count(): Promise<number> {
    return 0
  }

  public async ids(): Promise<string[]> {
    return []
  }
}

class FakeQueuedJob implements QueuedJob {
  private deleted = false
  private released = false
  private failed = false
  public releasedDelay: number | undefined

  public constructor(
    public readonly id: string,
    public readonly queue: string,
    public readonly payload: JobPayload,
    public readonly attempts: number,
  ) {}

  public get reservedAt(): Date | null {
    return null
  }
  public get availableAt(): Date {
    return new Date()
  }
  public get createdAt(): Date {
    return new Date()
  }

  public async delete(): Promise<void> {
    this.deleted = true
  }
  public async release(delay?: number): Promise<void> {
    this.released = true
    this.releasedDelay = delay
  }
  public async fail(): Promise<void> {
    this.failed = true
  }
  public async markAsFailed(): Promise<void> {
    this.failed = true
  }
  public isDeleted(): boolean {
    return this.deleted
  }
  public isReleased(): boolean {
    return this.released
  }
  public hasFailed(): boolean {
    return this.failed
  }
  public maxTries(): number {
    return this.payload.maxTries
  }
  public maxExceptions(): number {
    return this.payload.maxExceptions ?? 0
  }
  public timeout(): number {
    return this.payload.timeout
  }
  public retryUntil(): Date | null {
    return null
  }
}

function makePayload(): JobPayload {
  const job = new FlakyJob()
  return job.serialize()
}

describe('Worker', () => {
  it('releases on first failure with backoff, then logs failed after max tries', async () => {
    FlakyJob.ran = 0
    FlakyJob.failedHook = 0

    const failer = new MemoryFailer()
    const manager = {
      connection: () => {
        throw new Error('not used')
      },
      disconnect: async () => undefined,
    } as unknown as QueueManager

    const worker = new Worker(
      manager,
      new EventEmitter(),
      failer,
      () => false,
      () => undefined,
    )

    const options: WorkerOptions = {
      name: 't',
      queue: 'default',
      connection: 'sync',
      concurrency: 1,
      delay: 0,
      sleep: 0,
      maxTries: 0,
      maxJobs: 0,
      maxTime: 0,
      memory: 0,
      timeout: 0,
      rest: 0,
      force: true,
      stopWhenEmpty: false,
      backoff: 0,
    }

    const q1 = new FakeQueuedJob('1', 'default', makePayload(), 1)
    await worker.process('sync', q1, options)
    expect(q1.isReleased()).toBe(true)
    expect(q1.releasedDelay).toBe(1)
    expect(failer.logged.length).toBe(0)

    const q2 = new FakeQueuedJob('2', 'default', makePayload(), 2)
    await worker.process('sync', q2, options)
    expect(q2.isDeleted()).toBe(true)
    expect(failer.logged.length).toBe(1)
    expect(FlakyJob.failedHook).toBe(1)
    expect(FlakyJob.ran).toBe(2)
  })
})
