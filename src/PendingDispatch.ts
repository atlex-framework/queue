import type { PendingBatch } from './batch/PendingBatch.js'
import type { PendingChain } from './chain/PendingChain.js'
import type { Job } from './Job.js'

type DispatchFn = (job: Job) => Promise<string>

export class PendingDispatch implements PromiseLike<string> {
  private connection: string | null = null
  private queue: string | null = null
  private delayMs: number | null = null
  private afterResponseFlag = false
  private condition: boolean | (() => boolean) | null = null
  private unless: boolean | (() => boolean) | null = null

  public constructor(
    private readonly job: Job,
    private readonly dispatchFn: DispatchFn,
  ) {}

  public onConnection(connection: string): this {
    this.connection = connection
    return this
  }

  public onQueue(queue: string): this {
    this.queue = queue
    return this
  }

  public delay(ms: number): this {
    this.delayMs = ms
    return this
  }

  public delayUntil(date: Date): this {
    this.delayMs = Math.max(0, date.getTime() - Date.now())
    return this
  }

  public dispatchIf(condition: boolean | (() => boolean)): this {
    this.condition = condition
    return this
  }

  public dispatchUnless(condition: boolean | (() => boolean)): this {
    this.unless = condition
    return this
  }

  public afterResponse(): this {
    this.afterResponseFlag = true
    return this
  }

  public chain(_jobs: Job[]): PendingChain {
    throw new Error('PendingDispatch.chain is not wired in this build. Use Bus.chain() instead.')
  }

  public batch(_jobs: Job[]): PendingBatch {
    throw new Error('PendingDispatch.batch is not wired in this build. Use Bus.batch() instead.')
  }

  public uniqueFor(_seconds: number): this {
    return this
  }

  public uniqueId(_id: string): this {
    return this
  }

  private shouldDispatch(): boolean {
    if (this.condition !== null) {
      const v = typeof this.condition === 'function' ? this.condition() : this.condition
      if (!v) return false
    }
    if (this.unless !== null) {
      const v = typeof this.unless === 'function' ? this.unless() : this.unless
      if (v) return false
    }
    return true
  }

  public async dispatch(): Promise<string> {
    if (!this.shouldDispatch()) {
      return ''
    }

    if (this.connection !== null) {
      this.job.onConnection(this.connection)
    }
    if (this.queue !== null) {
      this.job.onQueue(this.queue)
    }
    if (this.delayMs !== null) {
      this.job.withDelay(Math.ceil(this.delayMs / 1000))
    }

    if (this.afterResponseFlag) {
      queueMicrotask(() => {
        void this.dispatchFn(this.job)
      })
      return this.job.uuid
    }
    return await this.dispatchFn(this.job)
  }

  public then<TResult1 = string, TResult2 = never>(
    onfulfilled?: ((value: string) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    return this.dispatch().then(onfulfilled, onrejected)
  }
}
