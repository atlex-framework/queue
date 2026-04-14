# @atlex/queue

> Robust background job processing with multiple queue drivers, batching, scheduling, and failure handling for Express + TypeScript applications.

[![npm version](https://img.shields.io/npm/v/@atlex/queue.svg?style=flat-square&color=7c3aed)](https://www.npmjs.com/package/@atlex/queue)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6?style=flat-square)](https://www.typescriptlang.org/)
[![License](https://img.shields.io/badge/license-MIT-blue.svg?style=flat-square)](LICENSE)

[![Buy Me A Coffee](https://img.shields.io/badge/Buy%20Me%20A%20Coffee-Support-yellow?style=flat-square&logo=buy-me-a-coffee)](https://buymeacoffee.com/khamazaspyan)

## Installation

```bash
npm install @atlex/queue
```

For BullMQ driver support:

```bash
npm install bull bullmq
```

For AWS SQS support:

```bash
npm install @aws-sdk/client-sqs
```

## Quick start

Define a job class:

```typescript
import { Job } from '@atlex/queue'

export class SendEmail extends Job {
  public static queue = 'emails'
  public static tries = 3
  public static timeout = 30

  public constructor(
    private email: string,
    private subject: string,
  ) {
    super()
  }

  public async handle(): Promise<void> {
    console.log(`Sending email to ${this.email}: ${this.subject}`)
    // Send email logic here
  }
}
```

Dispatch the job:

```typescript
import { dispatch } from '@atlex/queue'

// Queue for background processing
await dispatch(new SendEmail('user@example.com', 'Welcome!'))

// Execute synchronously
await dispatch(new SendEmail('user@example.com', 'Welcome!')).dispatchSync()

// Execute after HTTP response
await dispatch(new SendEmail('user@example.com', 'Welcome!')).dispatchAfterResponse()
```

Process jobs:

```bash
npx atlex queue:work
```

## Features

### Multiple Drivers

- **SyncDriver**: Execute jobs synchronously (development)
- **NullDriver**: Discard jobs (testing)
- **DatabaseDriver**: SQL-backed queue with persistence
- **BullMQDriver**: Redis-backed with BullMQ library
- **SqsDriver**: AWS SQS integration

### Job Features

- Automatic serialization/deserialization
- Constructor-based payload preservation
- Retry logic with configurable attempts
- Exponential backoff and custom delay strategies
- Job timeout enforcement
- Job middleware for wrapping execution
- Unique job constraints
- Batch processing support
- Job chaining
- Failed job tracking and retry commands

### Failure Handling

- Failed job storage and inspection
- Retry mechanism with exponential backoff
- Failed job cleanup
- DatabaseFailedJobProvider for persistence
- Max attempts and timeout error distinction

### Batching

- Batch multiple jobs together
- `then()`, `catch()`, `finally()` callbacks
- Atomic batch operations
- Batch callbacks after all jobs complete
- Batch cancellation

### Scheduling

- Cron-based task scheduling
- Common schedule shortcuts (daily, weekly, monthly)
- Timezone support
- Schedule mutations and mutex locking
- CacheScheduleMutex, RedisScheduleMutex, FileScheduleMutex

### Middleware

- Job middleware pipeline
- Execute code before/after job handling
- Conditional job processing
- Logging and monitoring hooks

### Configuration

- Per-job settings (queue, connection, tries, timeout)
- Class-level defaults
- Runtime overrides
- Multiple named connections

## Core APIs

### Job Class

Define background jobs by extending `Job`:

```typescript
import { Job } from '@atlex/queue'

export class ProcessImage extends Job {
  // Static configuration
  public static queue = 'images' // Target queue
  public static connection = 'default' // Connection name
  public static tries = 3 // Retry attempts
  public static timeout = 120 // Seconds
  public static maxExceptions = 2 // Max exceptions before failure
  public static backoff = 'exponential' // Backoff strategy
  public static retryUntil = null // Unix timestamp stop retrying

  // Instance properties
  public attempts = 0 // Current attempt number
  public batchId: string | null = null // Batch membership
  public chained: JobPayload[] = [] // Chained jobs

  public constructor(
    private imageId: string,
    private format: string = 'jpeg',
  ) {
    super()
  }

  /**
   * Main job logic.
   */
  public async handle(): Promise<void> {
    const image = await Image.find(this.imageId)
    await image.processAndStore(this.format)
  }

  /**
   * Called before handle() executes. Return false to skip job.
   */
  public async before(): Promise<boolean | void> {
    const image = await Image.find(this.imageId)
    if (!image) return false // Skip if image doesn't exist
  }

  /**
   * Called after successful handle().
   */
  public async after(): Promise<void> {
    console.log('Job completed')
  }

  /**
   * Called when job fails (after all retries exhausted).
   */
  public async failed(error: Error): Promise<void> {
    console.error(`Job failed: ${error.message}`)
    // Notify user, log to external service, etc.
  }

  /**
   * Custom middleware for this job.
   */
  public middleware(): JobMiddleware[] {
    return [
      {
        async handle(job, next) {
          console.log('Before job')
          try {
            await next()
          } finally {
            console.log('After job')
          }
        },
      },
    ]
  }

  /**
   * Run after job succeeds (useful for chaining).
   */
  public chained(): JobPayload[] {
    return [new GenerateThumbnail(this.imageId), new NotifyUser(this.imageId)]
  }
}
```

### Dispatching Jobs

```typescript
import { dispatch, dispatchSync, dispatchAfterResponse } from '@atlex/queue'

// Queue job for background processing
await dispatch(new SendEmail('user@example.com', 'Hello'))

// Execute immediately (synchronous)
await dispatchSync(new SendEmail('user@example.com', 'Hello'))

// Execute after HTTP response sent (non-blocking to client)
await dispatchAfterResponse(new SendEmail('user@example.com', 'Hello'))
```

### QueueManager

Central job dispatcher and queue manager:

```typescript
import { QueueManager } from '@atlex/queue'

const queueManager = app.make(QueueManager)

// Dispatch job
await queueManager.dispatch(job)

// Dispatch after response
await queueManager.dispatchAfterResponse(job)

// Dispatch synchronously
await queueManager.dispatchSync(job)

// Get driver for specific connection
const connection = queueManager.connection('redis')

// Mark job as failed
await queueManager.fail(job, error)

// Extend queue with custom driver
queueManager.extend('custom', (app) => new CustomDriver(app))
```

### PendingDispatch

Fluent interface for job dispatch with options:

```typescript
const pending = dispatch(job)

// Delay job execution
pending.delay(60) // 60 seconds
pending.delay(Duration.minutes(5)) // 5 minutes

// Specify queue
pending.onQueue('emails')

// Specify connection
pending.onConnection('redis')

// Set timeout
pending.timeout(120) // 120 seconds

// Retry configuration
pending.retry(5)

// Ensure job uniqueness
pending.unique()

// Dispatch methods
await pending.dispatch() // Queue it
await pending.dispatchSync() // Execute now
await pending.dispatchAfterResponse() // Queue for after response
```

### Worker

Run the queue worker to process jobs:

```typescript
import { Worker, WorkerOptions } from '@atlex/queue'

const worker = new Worker(app)

await worker.run({
  queue: 'default', // Queue to process
  connection: 'default', // Connection name
  memory: 128, // Max memory in MB
  timeout: 300, // Job timeout in seconds
  maxJobs: 0, // Max jobs to process (0 = unlimited)
  sleep: 3, // Sleep time between polls (seconds)
})
```

Run via CLI:

```bash
# Process default queue
npx atlex queue:work

# Process specific queue
npx atlex queue:work --queue=emails

# Process multiple queues
npx atlex queue:work --queue=emails --queue=notifications

# Set memory limit
npx atlex queue:work --memory=256

# Set timeout
npx atlex queue:work --timeout=180

# Stop after N jobs
npx atlex queue:work --max-jobs=100
```

## Queue Drivers

### SyncDriver

Execute jobs synchronously immediately (useful for development/testing):

```typescript
// config/queue.ts
export default {
  default: 'sync',
  connections: {
    sync: {
      driver: 'sync',
    },
  },
} as QueueConfig
```

### NullDriver

Discard jobs without processing (useful for testing):

```typescript
export default {
  default: 'null',
  connections: {
    null: {
      driver: 'null',
    },
  },
} as QueueConfig
```

### DatabaseDriver

Store jobs in SQL database with polling:

```typescript
export default {
  default: 'database',
  connections: {
    database: {
      driver: 'database',
      table: 'jobs',
      failedTable: 'failed_jobs',
    },
  },
} as QueueConfig
```

Create migrations:

```typescript
import { JobsTableMigration } from '@atlex/orm'

// In migration
new JobsTableMigration().up()
new FailedJobsTableMigration().up()
```

### BullMQDriver

High-performance Redis queue using BullMQ:

```typescript
export default {
  default: 'bullmq',
  connections: {
    bullmq: {
      driver: 'bullmq',
      redis: {
        host: 'localhost',
        port: 6379,
        db: 0,
      },
    },
  },
} as QueueConfig
```

### SqsDriver

AWS SQS queue integration:

```typescript
export default {
  default: 'sqs',
  connections: {
    sqs: {
      driver: 'sqs',
      region: 'us-east-1',
      queue: 'https://sqs.us-east-1.amazonaws.com/123456789/my-queue',
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    },
  },
} as QueueConfig
```

## Failure Handling

### DatabaseFailedJobProvider

Track and retry failed jobs:

```typescript
import { DatabaseFailedJobProvider } from '@atlex/queue'

const provider = new DatabaseFailedJobProvider(db, 'failed_jobs')

// Get all failed jobs
const failed = await provider.all()

// Get specific failed job
const job = await provider.get(id)

// Retry a failed job
await provider.retry(id)

// Delete failed job
await provider.forget(id)

// Clear all failed jobs
await provider.flush()
```

### Failed Job Events

Failed jobs trigger specific error types:

```typescript
import { MaxAttemptsExceededError, TimeoutExceededError } from '@atlex/queue'

export class MyJob extends Job {
  public async failed(error: Error): Promise<void> {
    if (error instanceof MaxAttemptsExceededError) {
      console.error('Job exhausted all retries')
    } else if (error instanceof TimeoutExceededError) {
      console.error('Job execution timed out')
    }
  }
}
```

### Retry CLI Commands

```bash
# List failed jobs
npx atlex queue:failed

# Show failed job details
npx atlex queue:failed --show=id

# Retry failed job
npx atlex queue:retry id

# Flush all failed jobs
npx atlex queue:flush
```

## Batching

Group multiple jobs and handle completion:

```typescript
import { app } from '@atlex/core'

const batch = app.make(Scheduler).batch()

// Add multiple jobs
batch
  .add(new SendEmail('user1@example.com', 'Hello'))
  .add(new SendEmail('user2@example.com', 'Hello'))
  .add(new SendEmail('user3@example.com', 'Hello'))

// Handle completion of all jobs
batch.then(async () => {
  console.log('All emails sent!')
})

// Handle batch failure
batch.catch(async (error) => {
  console.log('Batch failed:', error)
})

// Handle finally (always)
batch.finally(async () => {
  console.log('Batch complete')
})

// Dispatch the batch
await batch.dispatch()
```

## Scheduling

Schedule tasks to run on intervals via cron:

```typescript
import { Scheduler } from '@atlex/queue'

const scheduler = app.make(Scheduler)

// Schedule job to run daily at 2 AM
scheduler.call(new CleanupOldFiles()).daily()

// Schedule command every 5 minutes
scheduler.exec('analytics:process').everyFiveMinutes()

// Cron expression
scheduler.call(new SendDailyReport()).cron('0 9 * * 1-5') // Weekdays at 9 AM

// Advanced scheduling
scheduler
  .call(new BackupDatabase())
  .cron('0 0 * * *') // Daily at midnight
  .timezone('America/New_York')
```

### Schedule Shortcuts

```typescript
scheduler.call(job).everyMinute()
scheduler.call(job).everyFiveMinutes()
scheduler.call(job).everyTenMinutes()
scheduler.call(job).everyFifteenMinutes()
scheduler.call(job).everyThirtyMinutes()
scheduler.call(job).hourly()
scheduler.call(job).daily()
scheduler.call(job).weekly()
scheduler.call(job).monthly()
scheduler.call(job).quarterly()
scheduler.call(job).yearly()
scheduler.call(job).weekdays()
scheduler.call(job).weekends()
scheduler.call(job).sundays()
scheduler.call(job).mondays()
// ... etc for all days
```

## Configuration

Create `config/queue.ts`:

```typescript
import type { QueueConfig } from '@atlex/queue'

export default {
  // Default connection
  default: process.env.QUEUE_CONNECTION || 'sync',

  // Named connections
  connections: {
    sync: {
      driver: 'sync',
    },

    database: {
      driver: 'database',
      table: 'jobs',
      failedTable: 'failed_jobs',
    },

    redis: {
      driver: 'bullmq',
      redis: {
        host: process.env.REDIS_HOST || 'localhost',
        port: process.env.REDIS_PORT || 6379,
        db: process.env.REDIS_DB || 0,
        password: process.env.REDIS_PASSWORD,
      },
    },

    sqs: {
      driver: 'sqs',
      region: process.env.AWS_REGION || 'us-east-1',
      queue: process.env.SQS_QUEUE_URL,
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    },
  },

  // Failed jobs
  failed: {
    driver: 'database',
    table: 'failed_jobs',
  },
} as QueueConfig
```

## Complete Examples

### Email Job with Retry

```typescript
import { Job } from '@atlex/queue'
import { mail } from '@atlex/mail'

export class SendEmailJob extends Job {
  public static queue = 'emails'
  public static tries = 5
  public static timeout = 30
  public static backoff = 'exponential'

  public constructor(
    private readonly email: string,
    private readonly subject: string,
    private readonly template: string,
    private readonly data: Record<string, any> = {},
  ) {
    super()
  }

  public async handle(): Promise<void> {
    await mail().to(this.email).send(this.template, this.data)
  }

  public async failed(error: Error): Promise<void> {
    // Log email failure to monitoring service
    console.error(`Failed to send email to ${this.email}:`, error)

    // Notify admin
    await mail().to('admin@example.com').send('email-failure-alert', {
      email: this.email,
      error: error.message,
    })
  }
}

// Dispatch
router.post('/signup', async (req, res) => {
  const user = await User.create(req.body)

  // Queue welcome email
  await dispatch(new SendEmailJob(user.email, 'Welcome!', 'welcome', { name: user.name })).delay(5) // Delay 5 seconds

  res.json({ message: 'Signed up! Check your email.' })
})
```

### Unique Job

Prevent duplicate processing:

```typescript
export class ProcessPayment extends Job {
  public static queue = 'payments'
  public static tries = 3

  public constructor(private orderId: string) {
    super()
  }

  public async handle(): Promise<void> {
    const order = await Order.find(this.orderId)
    await order.processPayment()
  }

  public shouldBeUnique(): boolean {
    return true // Unique per instance
  }
}

// Queue multiple times, only processes once
await dispatch(new ProcessPayment('order-123'))
await dispatch(new ProcessPayment('order-123'))
await dispatch(new ProcessPayment('order-123'))
```

### Job Chaining

Execute jobs in sequence:

```typescript
export class ImageProcessingJob extends Job {
  public async handle(): Promise<void> {
    const image = await Image.find(this.imageId)
    await image.compress()
  }

  public chained(): JobPayload[] {
    return [
      new ResizeImage(this.imageId, { width: 500 }),
      new GenerateThumbnail(this.imageId),
      new NotifyUserComplete(this.imageId),
    ]
  }
}

// Dispatch starts the chain
await dispatch(new ImageProcessingJob('img-456'))
// Next: ResizeImage → GenerateThumbnail → NotifyUserComplete
```

### Batch Processing

Process multiple jobs with callbacks:

```typescript
router.post('/send-newsletter', async (req, res) => {
  const users = await User.all()

  const batch = app.make(Scheduler).batch()

  for (const user of users) {
    batch.add(new SendNewsletter(user.email))
  }

  batch.then(async () => {
    console.log(`Newsletter sent to ${users.length} users`)
  })

  batch.catch(async (error) => {
    console.error('Newsletter batch failed:', error)
  })

  await batch.dispatch()

  res.json({ message: 'Newsletter queued for sending' })
})
```

### Job Middleware

Wrap job execution with logging/monitoring:

```typescript
export class MonitoredJob extends Job {
  public middleware(): JobMiddleware[] {
    return [
      {
        async handle(job, next) {
          const startTime = Date.now()
          console.log(`Starting job: ${job.constructor.name}`)

          try {
            await next()
            const duration = Date.now() - startTime
            console.log(`Job completed in ${duration}ms`)
          } catch (error) {
            console.error('Job failed:', error)
            throw error
          }
        },
      },
    ]
  }
}
```

## API Overview

### Job

- `Job.handle()` - Main job logic (required)
- `Job.failed(error)` - Called on failure
- `Job.before()` - Called before handle
- `Job.after()` - Called after success
- `Job.middleware()` - Custom middleware
- `Job.chained()` - Chained jobs
- `Job.shouldBeUnique()` - Uniqueness check

### Dispatch

- `dispatch(job)` - Queue job
- `dispatchSync(job)` - Execute immediately
- `dispatchAfterResponse(job)` - Queue after response
- `PendingDispatch.delay(seconds)` - Delay execution
- `PendingDispatch.onQueue(name)` - Specify queue
- `PendingDispatch.onConnection(name)` - Specify connection
- `PendingDispatch.timeout(seconds)` - Set timeout
- `PendingDispatch.retry(attempts)` - Set retries

### QueueManager

- `QueueManager.dispatch(job)` - Queue job
- `QueueManager.dispatchSync(job)` - Execute immediately
- `QueueManager.dispatchAfterResponse(job)` - Defer dispatch
- `QueueManager.connection(name)` - Get driver
- `QueueManager.fail(job, error)` - Mark failed
- `QueueManager.extend(name, factory)` - Add driver

### Worker

- `Worker.run(options)` - Start processing
- `Worker.processJob(job)` - Execute single job

### Scheduler

- `Scheduler.call(job)` - Schedule job
- `Scheduler.exec(command)` - Schedule command
- `Scheduler.cron(expression)` - Cron schedule

### Failed Jobs

- `DatabaseFailedJobProvider.all()` - List failed
- `DatabaseFailedJobProvider.retry(id)` - Retry job
- `DatabaseFailedJobProvider.forget(id)` - Delete job
- `DatabaseFailedJobProvider.flush()` - Clear all

## Events

Jobs emit events during execution:

- Job dispatched
- Job executing
- Job succeeded
- Job failed
- Job timeout
- Job retry

Subscribe via event dispatcher:

```typescript
dispatcher.on('job.succeeded', (event) => {
  console.log('Job succeeded:', event.job)
})

dispatcher.on('job.failed', (event) => {
  console.log('Job failed:', event.job, event.error)
})
```

## Documentation

For comprehensive documentation, visit [atlex.dev/guide/queue](https://atlex.dev/guide/queue)

## License

MIT
