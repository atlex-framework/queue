import type { EventEmitter } from 'node:events'

import type { Container } from '@atlex/core'

import type { Job } from '../Job.js'

import { CallbackEvent } from './events/CallbackEvent.js'
import {
  ConsoleCommandEvent,
  type ConsoleCommandEventOptions,
} from './events/ConsoleCommandEvent.js'
import { JobEvent, type JobEventOptions } from './events/JobEvent.js'
import type { ScheduleMutex } from './mutex/ScheduleMutex.js'
import { ScheduledTask, type ScheduleRunResult } from './ScheduledTask.js'

export interface ScheduleConfig {
  /** Default timezone for all scheduled tasks. Per-task override available. */
  readonly timezone: string

  /** Environment the scheduler runs in. */
  readonly environment: string

  /** Default overlap prevention timeout in minutes. */
  readonly defaultOverlapTimeout: number
}

/**
 * Registry + evaluation engine for scheduled tasks.
 */
export class Scheduler {
  readonly #mutex: ScheduleMutex
  readonly #config: ScheduleConfig
  #timezone: string

  readonly #tasks: ScheduledTask[] = []
  readonly #beforeEach: ((task: ScheduledTask) => void | Promise<void>)[] = []
  readonly #afterEach: ((
    task: ScheduledTask,
    result: ScheduleRunResult,
  ) => void | Promise<void>)[] = []
  readonly #onFailure: ((task: ScheduledTask, error: Error) => void | Promise<void>)[] = []

  /**
   * @param app - Application container.
   * @param events - Global event emitter.
   * @param mutex - Mutex implementation.
   * @param config - Scheduler config.
   * @param timezone - Default timezone.
   */
  constructor(
    app: Container,
    events: EventEmitter,
    mutex: ScheduleMutex,
    config: ScheduleConfig,
    timezone: string,
  ) {
    void app
    void events
    this.#mutex = mutex
    this.#config = config
    this.#timezone = timezone
  }

  /**
   * Register a callback.
   *
   * @param callback - Callback to run.
   * @param description - Optional description.
   * @returns ScheduledTask.
   */
  call(callback: () => void | Promise<void>, description?: string): ScheduledTask {
    const task = new ScheduledTask(
      new CallbackEvent(callback, description),
      this.#mutex,
      this.#timezone,
    )
    this.#tasks.push(task)
    return task
  }

  /**
   * Register a queue job class to be dispatched on schedule.
   *
   * @param jobClass - Job class.
   * @param options - Dispatch options.
   * @returns ScheduledTask.
   */
  job(jobClass: new (...args: unknown[]) => Job, options: JobEventOptions = {}): ScheduledTask {
    const task = new ScheduledTask(new JobEvent(jobClass, options), this.#mutex, this.#timezone)
    this.#tasks.push(task)
    return task
  }

  /**
   * Register an Atlex / Artisan console command to run on schedule (subprocess).
   *
   * @param command - Command name and arguments (e.g. `example:command`, `migrate --force`).
   * @param options - Optional project cwd and path to the `atlex` CLI script.
   * @returns ScheduledTask for fluent frequency / overlap options.
   */
  command(command: string, options?: ConsoleCommandEventOptions): ScheduledTask {
    const task = new ScheduledTask(
      new ConsoleCommandEvent(command, options),
      this.#mutex,
      this.#timezone,
    )
    this.#tasks.push(task)
    return task
  }

  /**
   * Evaluate all registered tasks and return those due now.
   *
   * @param now - Time to evaluate.
   * @returns Due tasks.
   */
  dueEvents(now: Date = new Date()): ScheduledTask[] {
    return this.#tasks.filter((t) => t.isDue(now))
  }

  /**
   * Run all tasks due now.
   *
   * @param now - Time override (for tests).
   * @returns Results for all due tasks.
   */
  async runDueEvents(now: Date = new Date()): Promise<ScheduleRunResult[]> {
    const due = this.dueEvents(now)
    const results: ScheduleRunResult[] = []

    for (const task of due) {
      for (const hook of this.#beforeEach) {
        await Promise.resolve(hook(task))
      }

      const result = await task.run(this.#config.environment)
      results.push(result)

      if (!result.success && result.error !== null) {
        for (const hook of this.#onFailure) {
          await Promise.resolve(hook(task, result.error))
        }
      }

      for (const hook of this.#afterEach) {
        await Promise.resolve(hook(task, result))
      }
    }

    return results
  }

  /**
   * @returns All registered tasks.
   */
  events(): ScheduledTask[] {
    return [...this.#tasks]
  }

  /**
   * Find task by name/summary.
   *
   * @param name - Name to search.
   * @returns Task or null.
   */
  findByName(name: string): ScheduledTask | null {
    const n = name.trim()
    return this.#tasks.find((t) => t.getSummary() === n) ?? null
  }

  /**
   * @returns Scheduler timezone.
   */
  timezone(): string {
    return this.#timezone
  }

  /**
   * Set scheduler timezone.
   *
   * @param timezone - IANA timezone.
   */
  useTimezone(timezone: string): void {
    this.#timezone = timezone
  }

  /**
   * Register before-each hook.
   *
   * @param callback - Hook.
   * @returns this.
   */
  before(callback: (task: ScheduledTask) => void | Promise<void>): this {
    this.#beforeEach.push(callback)
    return this
  }

  /**
   * Register after-each hook.
   *
   * @param callback - Hook.
   * @returns this.
   */
  after(callback: (task: ScheduledTask, result: ScheduleRunResult) => void | Promise<void>): this {
    this.#afterEach.push(callback)
    return this
  }

  /**
   * Register global failure hook.
   *
   * @param callback - Hook.
   * @returns this.
   */
  onFailure(callback: (task: ScheduledTask, error: Error) => void | Promise<void>): this {
    this.#onFailure.push(callback)
    return this
  }
}
