export interface QueueConfig {
  readonly default: string
  readonly connections: Record<string, QueueConnectionConfig>
  readonly failed: {
    readonly driver: 'database'
    readonly database: string
    readonly table: string
  }
  readonly batching: {
    readonly database: string
    readonly table: string
  }
}

export type QueueConnectionConfig =
  | BullMQConnectionConfig
  | DatabaseConnectionConfig
  | SqsConnectionConfig
  | SyncConnectionConfig
  | NullConnectionConfig

export interface BullMQConnectionConfig {
  readonly driver: 'bullmq'
  readonly connection: string
  readonly queue: string
  readonly retryAfter: number
  readonly blockFor: number
  readonly prefix: string
  readonly concurrency: number
  readonly maxRetriesPerRequest: null
}

export interface DatabaseConnectionConfig {
  readonly driver: 'database'
  readonly connection: string
  readonly table: string
  readonly queue: string
  readonly retryAfter: number
  readonly pollInterval: number
  readonly concurrency: number
}

export interface SqsConnectionConfig {
  readonly driver: 'sqs'
  readonly region: string
  readonly prefix: string
  readonly queue: string
  readonly suffix: string
  readonly credentials: {
    readonly key: string
    readonly secret: string
  }
  readonly retryAfter: number
  readonly concurrency: number
}

export interface SyncConnectionConfig {
  readonly driver: 'sync'
}

export interface NullConnectionConfig {
  readonly driver: 'null'
}

export const defaultQueueConfig: QueueConfig = {
  default: 'sync',
  connections: {
    sync: { driver: 'sync' },
  },
  failed: {
    driver: 'database',
    database: 'default',
    table: 'failed_jobs',
  },
  batching: {
    database: 'default',
    table: 'job_batches',
  },
}
