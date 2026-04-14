import { dispatch } from '../../dispatch.js'
import type { Job } from '../../Job.js'
import { ScheduledTaskEvent } from '../ScheduledTaskEvent.js'

export interface JobEventOptions {
  readonly connection?: string
  readonly queue?: string
  readonly data?: Readonly<Record<string, unknown>>
}

/**
 * Dispatches a queue job when due.
 */
export class JobEvent extends ScheduledTaskEvent {
  readonly #jobClass: new (...args: unknown[]) => Job
  readonly #options: JobEventOptions

  /**
   * @param jobClass - Job class constructor.
   * @param options - Dispatch options.
   */
  constructor(jobClass: new (...args: unknown[]) => Job, options: JobEventOptions = {}) {
    super()
    this.#jobClass = jobClass
    this.#options = options
  }

  override async run(): Promise<string> {
    const job = new this.#jobClass()
    // Best-effort: if job supports data via `setData`, apply it. Otherwise ignore.
    const maybe = job as unknown as { setData?: (data: Readonly<Record<string, unknown>>) => void }
    if (this.#options.data !== undefined && typeof maybe.setData === 'function') {
      maybe.setData(this.#options.data)
    }
    const pending = dispatch(job)
    if (this.#options.connection !== undefined) pending.onConnection(this.#options.connection)
    if (this.#options.queue !== undefined) pending.onQueue(this.#options.queue)
    await pending.dispatch()
    return `Dispatched ${this.getSummary()}`
  }

  override getSummary(): string {
    const name = this.#jobClass.name.length > 0 ? this.#jobClass.name : '(AnonymousJob)'
    return `Job: ${name}`
  }
}
