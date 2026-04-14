import crypto from 'node:crypto'

import { CronExpression } from './CronExpression.js'
import { ManagesFrequencies } from './ManagesFrequencies.js'
import type { ScheduleMutex } from './mutex/ScheduleMutex.js'
import type { ScheduledTaskEvent } from './ScheduledTaskEvent.js'

export type ScheduleSkipReason = 'overlapping' | 'environment' | 'truth_test'

export interface ScheduleRunResult {
  readonly task: ScheduledTask
  readonly success: boolean
  readonly output: string
  readonly error: Error | null
  readonly duration: number
  readonly skippedReason?: ScheduleSkipReason
}

/**
 * A single scheduled task with fluent configuration.
 */
export class ScheduledTask extends ManagesFrequencies {
  readonly #event: ScheduledTaskEvent
  readonly #mutex: ScheduleMutex
  #timezone: string

  #name: string | null = null
  #description: string | null = null

  #environments: readonly string[] | null = null
  #when: (() => boolean | Promise<boolean>)[] = []
  #skip: (() => boolean | Promise<boolean>)[] = []

  #withoutOverlapping: { readonly expiresAtMinutes: number } | null = null

  #beforeHooks: (() => void | Promise<void>)[] = []
  #afterHooks: ((output: string) => void | Promise<void>)[] = []
  #successHooks: ((output: string) => void | Promise<void>)[] = []
  #failureHooks: ((error: Error) => void | Promise<void>)[] = []

  /**
   * @param event - Task event.
   * @param mutex - Mutex implementation.
   * @param timezone - Default timezone for this task.
   */
  constructor(event: ScheduledTaskEvent, mutex: ScheduleMutex, timezone: string) {
    super()
    this.#event = event
    this.#mutex = mutex
    this.#timezone = timezone
  }

  /**
   * Prevent overlapping executions.
   *
   * @param expiresAt - Minutes before lock is considered stale.
   * @returns This task.
   */
  withoutOverlapping(expiresAt = 1440): this {
    this.#withoutOverlapping = { expiresAtMinutes: expiresAt }
    return this
  }

  /**
   * @returns True when overlap prevention is enabled.
   */
  usesOverlapPrevention(): boolean {
    return this.#withoutOverlapping !== null
  }

  /**
   * Restrict task execution to environments.
   *
   * @param envs - Environment(s).
   * @returns This task.
   */
  environments(envs: string | string[]): this {
    this.#environments = Array.isArray(envs) ? envs : [envs]
    return this
  }

  /**
   * @returns This task.
   */
  inProduction(): this {
    return this.environments('production')
  }

  /**
   * @returns This task.
   */
  notInProduction(): this {
    this.#environments = ['development', 'test', 'staging']
    return this
  }

  /**
   * Only run when callback resolves true.
   *
   * @param callback - Predicate.
   * @returns This task.
   */
  when(callback: () => boolean | Promise<boolean>): this {
    this.#when.push(callback)
    return this
  }

  /**
   * Skip when callback resolves true.
   *
   * @param callback - Predicate.
   * @returns This task.
   */
  skip(callback: () => boolean | Promise<boolean>): this {
    this.#skip.push(callback)
    return this
  }

  /**
   * Set a per-task timezone.
   *
   * @param tz - IANA timezone.
   * @returns This task.
   */
  timezone(tz: string): this {
    this.#timezone = tz
    return this
  }

  /**
   * Give this task a name.
   *
   * @param name - Name.
   * @returns This task.
   */
  name(name: string): this {
    this.#name = name
    return this
  }

  /**
   * Set a description.
   *
   * @param desc - Description.
   * @returns This task.
   */
  description(desc: string): this {
    this.#description = desc
    return this
  }

  /**
   * Run before the task executes.
   *
   * @param callback - Hook.
   * @returns This task.
   */
  before(callback: () => void | Promise<void>): this {
    this.#beforeHooks.push(callback)
    return this
  }

  /**
   * Run after the task completes.
   *
   * @param callback - Hook.
   * @returns This task.
   */
  after(callback: (output: string) => void | Promise<void>): this {
    this.#afterHooks.push(callback)
    return this
  }

  /**
   * Run on success.
   *
   * @param callback - Hook.
   * @returns This task.
   */
  onSuccess(callback: (output: string) => void | Promise<void>): this {
    this.#successHooks.push(callback)
    return this
  }

  /**
   * Run on failure.
   *
   * @param callback - Hook.
   * @returns This task.
   */
  onFailure(callback: (error: Error) => void | Promise<void>): this {
    this.#failureHooks.push(callback)
    return this
  }

  /**
   * @returns Resolved timezone.
   */
  getTimezone(): string {
    return this.#timezone
  }

  /**
   * @returns Event summary.
   */
  getSummary(): string {
    return this.#name ?? this.#description ?? this.#event.getSummary()
  }

  /**
   * @returns Underlying event summary.
   */
  getEventSummary(): string {
    return this.#event.getSummary()
  }

  /**
   * Get mutex name key.
   *
   * @returns Mutex key.
   */
  mutexName(): string {
    const base = this.#name ?? this.#description ?? this.#event.getSummary()
    const digest = crypto.createHash('sha1').update(base).digest('hex').slice(0, 16)
    return `schedule:${digest}`
  }

  /**
   * Check if this task is due at the given time.
   *
   * @param now - Time to test (default: now).
   * @returns True if due.
   */
  isDue(now: Date = new Date()): boolean {
    const expr = CronExpression.parse(this.getExpression())
    return expr.matches(now, this.#timezone)
  }

  /**
   * Evaluate all runtime filters (environment + truth tests).
   *
   * @param environment - Current environment.
   * @returns True if filters pass.
   */
  async filtersPass(environment: string): Promise<boolean> {
    if (this.#environments !== null && !this.#environments.includes(environment)) return false
    for (const t of this.#when) {
      if (!(await Promise.resolve(t()))) return false
    }
    for (const s of this.#skip) {
      if (await Promise.resolve(s())) return false
    }
    return true
  }

  /**
   * Calculate next run date.
   *
   * @param now - Base time.
   * @returns Next run Date.
   */
  nextRunDate(now: Date = new Date()): Date {
    return CronExpression.parse(this.getExpression()).nextRun(now, this.#timezone)
  }

  /**
   * Calculate previous run date.
   *
   * @param now - Base time.
   * @returns Previous run Date.
   */
  previousRunDate(now: Date = new Date()): Date {
    return CronExpression.parse(this.getExpression()).previousRun(now, this.#timezone)
  }

  /**
   * Human readable frequency summary.
   *
   * @returns Summary string.
   */
  frequencySummary(): string {
    return CronExpression.parse(this.getExpression()).describe()
  }

  /**
   * Execute the scheduled task.
   *
   * @param environment - Current environment.
   * @returns ScheduleRunResult.
   */
  async run(environment: string): Promise<ScheduleRunResult> {
    const started = Date.now()

    if (!(await this.filtersPass(environment))) {
      return {
        task: this,
        success: true,
        output: '',
        error: null,
        duration: 0,
        skippedReason: this.#environments !== null ? 'environment' : 'truth_test',
      }
    }

    if (this.#withoutOverlapping !== null) {
      const acquired = await this.#mutex.create(this, this.#withoutOverlapping.expiresAtMinutes)
      if (!acquired) {
        return {
          task: this,
          success: true,
          output: '',
          error: null,
          duration: 0,
          skippedReason: 'overlapping',
        }
      }
    }

    try {
      for (const hook of this.#beforeHooks) {
        await Promise.resolve(hook())
      }

      const output = await this.#event.run()

      for (const hook of this.#successHooks) {
        await Promise.resolve(hook(output))
      }
      for (const hook of this.#afterHooks) {
        await Promise.resolve(hook(output))
      }

      return {
        task: this,
        success: true,
        output,
        error: null,
        duration: Date.now() - started,
      }
    } catch (e) {
      const err = e instanceof Error ? e : new Error(String(e))
      for (const hook of this.#failureHooks) {
        await Promise.resolve(hook(err))
      }
      for (const hook of this.#afterHooks) {
        await Promise.resolve(hook(''))
      }
      return {
        task: this,
        success: false,
        output: '',
        error: err,
        duration: Date.now() - started,
      }
    } finally {
      if (this.#withoutOverlapping !== null) {
        await this.#mutex.forget(this)
      }
    }
  }
}
