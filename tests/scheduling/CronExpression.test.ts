import { describe, expect, test } from 'vitest'

import { CronExpression } from '../../src/scheduling/CronExpression.js'
import { CronParseError } from '../../src/scheduling/errors/CronParseError.js'

describe('CronExpression', () => {
  test('parses 5-field cron', () => {
    const c = CronExpression.parse('* * * * *')
    expect(c.toString()).toBe('* * * * *')
  })

  test('rejects invalid field count', () => {
    expect(() => CronExpression.parse('* * * *')).toThrow(CronParseError)
  })

  test('matches every minute expression', () => {
    const c = CronExpression.parse('* * * * *')
    expect(c.matches(new Date('2026-04-07T08:00:00.000Z'), 'UTC')).toBe(true)
    expect(c.matches(new Date('2026-04-07T08:00:59.999Z'), 'UTC')).toBe(true)
  })

  test('nextRun finds next matching minute', () => {
    const c = CronExpression.parse('*/5 * * * *')
    const next = c.nextRun(new Date('2026-04-07T08:01:00.000Z'), 'UTC')
    expect(next.toISOString()).toBe('2026-04-07T08:05:00.000Z')
  })

  test('previousRun finds previous matching minute', () => {
    const c = CronExpression.parse('*/5 * * * *')
    const prev = c.previousRun(new Date('2026-04-07T08:06:00.000Z'), 'UTC')
    expect(prev.toISOString()).toBe('2026-04-07T08:05:00.000Z')
  })
})
