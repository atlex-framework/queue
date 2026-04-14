import './registerCoreQueueBridge.js'

export type { JobPayload } from './JobPayload.js'
export { Job, type JobMiddleware } from './Job.js'
export { BroadcastEventJob } from './jobs/events/BroadcastEventJob.js'
export { HandleListenerJob } from './jobs/events/HandleListenerJob.js'
export { JobRegistry, RegisterJob } from './JobRegistry.js'
export { QueueManager, type QueueManagerBindings } from './QueueManager.js'
export {
  dispatch,
  dispatchAfterResponse,
  dispatchSync,
  _getQueueManager,
  _setQueueManager,
} from './dispatch.js'
export { PendingDispatch } from './PendingDispatch.js'
export { Worker, calculateBackoff, type WorkerOptions } from './Worker.js'

export type { QueueDriver, QueuedJob } from './contracts/QueueDriver.js'
export type { ShouldQueue } from './contracts/ShouldQueue.js'
export type { ShouldBeUnique } from './contracts/ShouldBeUnique.js'
export type { ShouldBeUniqueUntilProcessing } from './contracts/ShouldBeUniqueUntilProcessing.js'
export type { ShouldBeEncrypted } from './contracts/ShouldBeEncrypted.js'
export type { Monitor } from './contracts/Monitor.js'

export { SyncDriver } from './drivers/SyncDriver.js'
export { NullDriver } from './drivers/NullDriver.js'
export { DatabaseDriver } from './drivers/DatabaseDriver.js'
export { BullMQDriver } from './drivers/BullMQDriver.js'
export { SqsDriver } from './drivers/SqsDriver.js'

export type { FailedJobProvider, FailedJob } from './failed/FailedJobProvider.js'
export { DatabaseFailedJobProvider } from './failed/DatabaseFailedJobProvider.js'

export { MaxAttemptsExceededError } from './errors/MaxAttemptsExceededError.js'
export { TimeoutExceededError } from './errors/TimeoutExceededError.js'
export { JobNotFoundError } from './errors/JobNotFoundError.js'
export { InvalidPayloadError } from './errors/InvalidPayloadError.js'
export { ManuallyFailedError } from './errors/ManuallyFailedError.js'
export { BatchCancelledError } from './errors/BatchCancelledError.js'

export type { QueueConfig, QueueConnectionConfig } from './config/queue.js'
export { defaultQueueConfig } from './config/queue.js'

export { Scheduler, type ScheduleConfig } from './scheduling/Scheduler.js'
export {
  ConsoleCommandEvent,
  type ConsoleCommandEventOptions,
} from './scheduling/events/ConsoleCommandEvent.js'
export { ScheduledTask, type ScheduleRunResult } from './scheduling/ScheduledTask.js'
export { CronExpression } from './scheduling/CronExpression.js'
export { CacheScheduleMutex } from './scheduling/mutex/CacheScheduleMutex.js'
export { RedisScheduleMutex } from './scheduling/mutex/RedisScheduleMutex.js'
export { FileScheduleMutex } from './scheduling/mutex/FileScheduleMutex.js'
export type { ScheduleMutex } from './scheduling/mutex/ScheduleMutex.js'
