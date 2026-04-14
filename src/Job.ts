import type { Application } from '@atlex/core'
import { v4 as uuidv4 } from 'uuid'

import type { Batch } from './batch/Batch.js'
import { InvalidPayloadError } from './errors/InvalidPayloadError.js'
import type { JobPayload } from './JobPayload.js'
import { JobRegistry } from './JobRegistry.js'

export interface JobMiddleware {
  /**
   * Wrap job execution.
   *
   * @param job - Job instance.
   * @param next - Invoke the next middleware (or the job's handle()).
   */
  handle(job: Job, next: () => Promise<void>): Promise<void>
}

type DispatchFn = (job: Job) => Promise<string>
type ResolveBatchFn = (batchId: string) => Promise<Batch | null>

interface JobRuntime {
  readonly app: Application | null
  readonly dispatch: DispatchFn
  readonly resolveBatch: ResolveBatchFn
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === 'object' && value !== null && Object.getPrototypeOf(value) === Object.prototype
  )
}

function serializeValue(value: unknown, seen: WeakSet<object>): unknown {
  if (value === null) return null
  const t = typeof value
  if (t === 'string' || t === 'number' || t === 'boolean') return value
  if (t === 'bigint') return { __type: 'bigint', value: (value as bigint).toString() }
  if (t === 'undefined') return { __type: 'undefined' }
  if (t === 'symbol' || t === 'function') return { __type: 'unsupported' }

  if (value instanceof Date) return { __type: 'date', value: value.toISOString() }
  if (value instanceof Uint8Array)
    return { __type: 'uint8array', value: Buffer.from(value).toString('base64') }
  if (value instanceof Error)
    return { __type: 'error', name: value.name, message: value.message, stack: value.stack ?? null }

  if (Array.isArray(value)) {
    return value.map((v) => serializeValue(v, seen))
  }

  if (typeof value === 'object') {
    if (seen.has(value)) {
      return { __type: 'circular' }
    }
    seen.add(value)
    if (isPlainObject(value)) {
      const out: Record<string, unknown> = {}
      for (const [k, v] of Object.entries(value)) {
        out[k] = serializeValue(v, seen)
      }
      return out
    }
    // For class instances, serialize enumerable props.
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = serializeValue(v, seen)
    }
    out.__type = 'object'
    out.__class = (value as { constructor?: { name?: unknown } }).constructor?.name ?? 'Object'
    return out
  }

  return { __type: 'unsupported' }
}

function deserializeValue(value: unknown): unknown {
  if (value === null) return null
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean')
    return value
  if (Array.isArray(value)) return value.map(deserializeValue)
  if (!isPlainObject(value)) return value

  const type = value.__type
  if (type === 'date' && typeof value.value === 'string') return new Date(value.value)
  if (type === 'bigint' && typeof value.value === 'string') return BigInt(value.value)
  if (type === 'uint8array' && typeof value.value === 'string')
    return Buffer.from(value.value, 'base64')
  if (type === 'undefined') return undefined
  if (type === 'error' && typeof value.message === 'string') {
    const err = new Error(value.message)
    if (typeof value.name === 'string') err.name = value.name
    if (typeof value.stack === 'string') err.stack = value.stack
    return err
  }

  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(value)) {
    if (k === '__type' || k === '__class') continue
    out[k] = deserializeValue(v)
  }
  return out
}

export abstract class Job {
  public static connection: string | null = null
  public static queue = 'default'
  public static tries = 1
  public static maxExceptions: number | null = null
  public static timeout = 60
  public static backoff: number | number[] | 'exponential' = 0
  public static retryUntil: number | null = null
  public static deleteWhenMissingModels = false

  public jobId = ''
  public uuid = uuidv4()
  public attempts = 0
  public batchId: string | null = null
  public chained: JobPayload[] = []
  public connection: string | null = null
  public queue: string | null = null
  public delay: number | null = null
  public middlewareStack: JobMiddleware[] = []

  private readonly constructorArgs: readonly unknown[]
  private released = false
  private deleted = false
  private failedFlag = false

  private runtime: JobRuntime | null = null

  protected constructor(...args: readonly unknown[]) {
    this.constructorArgs = args
    this.middlewareStack = this.middleware()
  }

  /**
   * The job's business logic.
   */
  public abstract handle(): Promise<void>

  /**
   * Called after the job has exhausted all retries.
   */

  public failed(_error: Error): void | Promise<void> {
    return
  }

  public before?(): Promise<boolean | void>
  public after?(): Promise<void>

  /**
   * Define middleware for this job instance.
   */
  public middleware(): JobMiddleware[] {
    return []
  }

  public onConnection(connection: string): this {
    this.connection = connection
    return this
  }

  public onQueue(queue: string): this {
    this.queue = queue
    return this
  }

  public withDelay(seconds: number): this {
    this.delay = seconds
    return this
  }

  /**
   * Release this job back to the queue.
   *
   * @param delay - Delay in seconds.
   */
  public release(delay?: number): void {
    this.released = true
    if (delay !== undefined) {
      this.delay = delay
    }
  }

  /**
   * Mark this job as failed.
   */
  public fail(error?: Error | string): void {
    this.failedFlag = true
    if (typeof error === 'string') {
      throw new Error(error)
    }
    if (error instanceof Error) {
      throw error
    }
    throw new Error('Job failed.')
  }

  /**
   * Delete the job from the queue backend.
   */
  public delete(): void {
    this.deleted = true
  }

  /**
   * @internal Set worker runtime bindings for chaining/batching.
   */
  public _setRuntime(runtime: JobRuntime): void {
    this.runtime = runtime
  }

  /**
   * @internal Get the owning app (if set by worker).
   */
  public _app(): Application | null {
    return this.runtime?.app ?? null
  }

  public batch(): Batch | null {
    if (this.batchId === null) return null
    if (this.runtime === null) return null
    // Consumer should call fresh() if needed.

    return null
  }

  public batchCancelled(): boolean {
    // Batch cancellation is checked via middleware in practice.
    return false
  }

  public async dispatchNextJobInChain(): Promise<void> {
    if (this.runtime === null) return
    const next = this.chained.shift()
    if (next === undefined) return
    const job = Job.deserialize(next)
    if (next.chainConnection !== null) {
      job.onConnection(next.chainConnection)
    }
    if (next.chainQueue !== null) {
      job.onQueue(next.chainQueue)
    }
    await this.runtime.dispatch(job)
  }

  public async invokeChainCatchCallback(_error: Error): Promise<void> {
    // Callbacks are serialized as strings and evaluated only when explicitly allowed.
    // This library does not evaluate arbitrary strings by default.
    return
  }

  protected serializeData(): Record<string, unknown> {
    return {}
  }

  public serialize(): JobPayload {
    const ctor = this.constructor as typeof Job
    const seen = new WeakSet()
    const args = serializeValue([...this.constructorArgs], seen)
    const extra = serializeValue(this.serializeData(), seen)
    const data: Record<string, unknown> = {
      args,
      ...(isPlainObject(extra) ? extra : { extra }),
    }

    return {
      uuid: this.uuid,
      displayName: this.displayName(),
      job: (this.constructor as { name: string }).name,
      data,
      attempts: this.attempts,
      maxTries: ctor.tries,
      maxExceptions: ctor.maxExceptions,
      timeout: ctor.timeout,
      backoff: ctor.backoff,
      retryUntil: ctor.retryUntil,
      connection: this.connection ?? ctor.connection,
      queue: this.queue ?? ctor.queue,
      delay: this.delay,
      chained: this.chained,
      chainConnection: null,
      chainQueue: null,
      chainCatchCallbackSerialized: null,
      batchId: this.batchId,
      tags: this.tags(),
      pushedAt: Date.now(),
      encrypted: false,
    }
  }

  public static deserialize(payload: JobPayload): Job {
    if (!isPlainObject(payload) || typeof payload.job !== 'string') {
      throw new InvalidPayloadError('Invalid job payload.')
    }
    const ctor = JobRegistry.resolve(payload.job)
    const data = payload.data
    const argsRaw = isPlainObject(data) ? data.args : undefined
    const args = Array.isArray(argsRaw) ? argsRaw.map(deserializeValue) : []
    const job = new ctor(...args)
    job.uuid = payload.uuid
    job.attempts = payload.attempts
    job.batchId = payload.batchId
    job.chained = payload.chained ?? []
    job.connection = payload.connection
    job.queue = payload.queue
    job.delay = payload.delay
    return job
  }

  public displayName(): string {
    return (this.constructor as { name: string }).name
  }

  public tags(): string[] {
    return []
  }

  public _isReleased(): boolean {
    return this.released
  }

  public _isDeleted(): boolean {
    return this.deleted
  }

  public _hasFailed(): boolean {
    return this.failedFlag
  }
}
