import { describe, expect, test } from 'vitest'
import { EventEmitter } from 'node:events'

import { Scheduler } from '../../src/scheduling/Scheduler.js'
import { CacheScheduleMutex } from '../../src/scheduling/mutex/CacheScheduleMutex.js'

describe('Scheduler', () => {
  test('registers and evaluates due callback tasks', async () => {
    const calls: string[] = []
    const scheduler = new Scheduler(
      // Container isn't used by current implementation; pass a minimal object.

      {} as unknown as import('@atlex/core').Container,
      new EventEmitter(),
      new CacheScheduleMutex(),
      { environment: 'test', timezone: 'UTC', defaultOverlapTimeout: 1440 },
      'UTC',
    )

    scheduler.call(() => calls.push('ran'), 'cleanup').everyMinute()

    const now = new Date('2026-04-07T08:00:00.000Z')
    const due = scheduler.dueEvents(now)
    expect(due).toHaveLength(1)

    const results = await scheduler.runDueEvents(now)
    expect(results).toHaveLength(1)
    expect(results[0]?.success).toBe(true)
    expect(calls).toEqual(['ran'])
  })

  test('overlap prevention skips overlapping run', async () => {
    const scheduler = new Scheduler(
      {} as unknown as import('@atlex/core').Container,
      new EventEmitter(),
      new CacheScheduleMutex(),
      { environment: 'test', timezone: 'UTC', defaultOverlapTimeout: 1440 },
      'UTC',
    )

    let resolveFirst: (() => void) | null = null
    const firstRunning = new Promise<void>((r) => {
      resolveFirst = r
    })

    const task = scheduler
      .call(async () => {
        await firstRunning
      }, 'slow')
      .everyMinute()
      .withoutOverlapping(60)

    // Start first run (will hold lock).
    const p1 = task.run('test')

    // Second run should skip due to lock.
    const r2 = await task.run('test')
    expect(r2.skippedReason).toBe('overlapping')

    // Finish first run.
    resolveFirst?.()
    const r1 = await p1
    expect(r1.success).toBe(true)
  })

  test('frequency helpers produce expected cron strings', () => {
    const scheduler = new Scheduler(
      {} as unknown as import('@atlex/core').Container,
      new EventEmitter(),
      new CacheScheduleMutex(),
      { environment: 'test', timezone: 'UTC', defaultOverlapTimeout: 1440 },
      'UTC',
    )

    const t1 = scheduler.call(() => undefined).everyMinute()
    expect(t1.getExpression()).toBe('* * * * *')

    const t2 = scheduler.call(() => undefined).everyHour()
    expect(t2.getExpression()).toBe('0 * * * *')

    const t3 = scheduler
      .call(() => undefined)
      .daily()
      .at('08:00')
    expect(t3.getExpression()).toBe('0 8 * * *')

    const t4 = scheduler.call(() => undefined).weekly()
    expect(t4.getExpression()).toBe('0 0 * * 0')

    const t5 = scheduler.call(() => undefined).cron('*/5 * * * *')
    expect(t5.getExpression()).toBe('*/5 * * * *')
  })

  test('command() registers a subprocess task for schedule:list', () => {
    const scheduler = new Scheduler(
      {} as unknown as import('@atlex/core').Container,
      new EventEmitter(),
      new CacheScheduleMutex(),
      { environment: 'test', timezone: 'UTC', defaultOverlapTimeout: 1440 },
      'UTC',
    )

    const task = scheduler.command('example:command').daily()
    expect(scheduler.events()).toHaveLength(1)
    expect(task.getSummary()).toBe('Command: example:command')
    expect(task.getExpression()).toBe('0 0 * * *')
  })
})
