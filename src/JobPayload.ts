export interface JobPayload {
  /**
   * UUIDv4 — unique dispatch ID.
   */
  uuid: string

  /**
   * Human-readable class name.
   */
  displayName: string

  /**
   * Fully qualified class name for registry lookup.
   */
  job: string

  /**
   * Serialized constructor arguments (plus any extra metadata the job chooses to include).
   */
  data: Record<string, unknown>

  /**
   * Current attempt number (1-based inside worker processing).
   */
  attempts: number

  /**
   * Max tries before permanent failure.
   */
  maxTries: number

  /**
   * Max exceptions before permanent failure.
   */
  maxExceptions: number | null

  /**
   * Timeout in seconds.
   */
  timeout: number

  /**
   * Backoff strategy in milliseconds.
   */
  backoff: number | number[] | 'exponential'

  /**
   * Unix timestamp seconds; when set, the worker will not retry after this time.
   */
  retryUntil: number | null

  /**
   * Connection override at dispatch-time (null = default connection).
   */
  connection: string | null

  /**
   * Queue name.
   */
  queue: string

  /**
   * Delay override in seconds (null = no delay).
   */
  delay: number | null

  /**
   * Remaining chain (serialized).
   */
  chained: JobPayload[]

  /**
   * Default connection for chained jobs (unless overridden per job).
   */
  chainConnection: string | null

  /**
   * Default queue for chained jobs (unless overridden per job).
   */
  chainQueue: string | null

  /**
   * Serialized chain catch callback.
   */
  chainCatchCallbackSerialized: string | null

  /**
   * Parent batch ID if present.
   */
  batchId: string | null

  /**
   * Monitoring tags.
   */
  tags: string[]

  /**
   * Dispatch timestamp in milliseconds.
   */
  pushedAt: number

  /**
   * Whether this payload is encrypted at rest.
   */
  encrypted: boolean
}
