import { ScheduledTaskEvent } from '../ScheduledTaskEvent.js'

/**
 * Runs an in-process callback.
 */
export class CallbackEvent extends ScheduledTaskEvent {
  readonly #callback: () => void | Promise<void>
  readonly #description?: string

  /**
   * @param callback - Callback to invoke.
   * @param description - Optional description.
   */
  constructor(callback: () => void | Promise<void>, description?: string) {
    super()
    this.#callback = callback
    this.#description = description
  }

  override async run(): Promise<string> {
    await Promise.resolve(this.#callback())
    return ''
  }

  override getSummary(): string {
    return this.#description ?? '(Closure)'
  }
}
