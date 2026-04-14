import { describe, expect, it } from 'vitest'

import { defaultQueueConfig } from '../src/config/queue.js'
import { CronExpression } from '../src/scheduling/CronExpression.js'
import { InvalidPayloadError } from '../src/errors/InvalidPayloadError.js'

describe('@atlex/queue examples', () => {
  it('defaultQueueConfig has default connection', () => {
    expect(defaultQueueConfig.default).toBeTruthy()
  })

  it('CronExpression nextRun', () => {
    const c = CronExpression.parse('0 0 * * *')
    expect(c.nextRun(new Date('2026-01-01T00:00:00Z'))).toBeInstanceOf(Date)
  })

  it('InvalidPayloadError message', () => {
    const e = new InvalidPayloadError('bad payload')
    expect(e.message).toContain('bad')
  })

  it('defaultQueueConfig failed driver', () => {
    expect(defaultQueueConfig.failed.driver).toBe('database')
  })

  it('defaultQueueConfig batching', () => {
    expect(defaultQueueConfig.batching.table).toBe('job_batches')
  })
})
