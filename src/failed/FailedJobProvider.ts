import type { JobPayload } from '../JobPayload.js'

export interface FailedJob {
  readonly id: string
  readonly uuid: string
  readonly connection: string
  readonly queue: string
  readonly payload: JobPayload
  readonly exception: string
  readonly failedAt: Date
}

export interface FailedJobProvider {
  /**
   * Persist a failed job record.
   *
   * @returns Failed job UUID.
   */
  log(
    connection: string,
    queue: string,
    payload: JobPayload,
    error: Error,
    failedAt: Date,
  ): Promise<string>

  find(id: string): Promise<FailedJob | null>
  all(): Promise<FailedJob[]>
  forget(id: string): Promise<boolean>
  flush(hours?: number): Promise<number>
  count(): Promise<number>
  ids(queue?: string): Promise<string[]>
}
