import { describe, expect, it, beforeEach } from 'vitest'

import { QueueManager } from '../src/QueueManager.js'
import { NullDriver } from '../src/drivers/NullDriver.js'
import { Job } from '../src/Job.js'
import { RegisterJob } from '../src/JobRegistry.js'
import { _setQueueManager, dispatch } from '../src/dispatch.js'
import type { QueueConfig } from '../src/config/queue.js'

@RegisterJob()
class SendEmailJob extends Job {
  public static override queue = 'default'
  public static override tries = 3
  public static override backoff = [1000, 5000, 30000] as const

  public constructor(public readonly userId: string) {
    super(userId)
  }

  public async handle(): Promise<void> {
    return
  }
}

describe('dispatch()', () => {
  let driver: NullDriver

  beforeEach(() => {
    const cfg: QueueConfig = {
      default: 'null',
      connections: { null: { driver: 'null' } },
      failed: { driver: 'database', database: 'default', table: 'failed_jobs' },
      batching: { database: 'default', table: 'job_batches' },
    }
    driver = new NullDriver()
    const manager = new QueueManager(cfg)
    manager.extend('null', () => driver)
    _setQueueManager(manager)
  })

  it('enqueues a job and supports fluent queue + delay', async () => {
    const id = await dispatch(new SendEmailJob('u1')).onQueue('emails').delay(5000)
    expect(id).toBeTruthy()
    driver.assertPushed('SendEmailJob', 1)
  })
})
