/**
 * Marker interface. Any class implementing this will be dispatched
 * to the queue instead of executing synchronously.
 */
export interface ShouldQueue {
  readonly connection?: string
  readonly queue?: string
  readonly delay?: number
  readonly tries?: number
  readonly timeout?: number
  readonly backoff?: number | number[]
  readonly maxExceptions?: number
}
