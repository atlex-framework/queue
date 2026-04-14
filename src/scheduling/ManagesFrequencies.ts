import { CronExpression } from './CronExpression.js'
import { CronParseError } from './errors/CronParseError.js'

/**
 * Fluent frequency builder for scheduled tasks.
 */
export class ManagesFrequencies {
  #expression = '* * * * *'

  /**
   * Set a raw cron expression.
   *
   * @param expression - Cron expression string.
   * @returns This instance.
   * @throws {CronParseError} If expression is invalid.
   */
  cron(expression: string): this {
    if (!CronExpression.isValid(expression)) {
      throw new CronParseError(`Invalid cron expression "${expression}".`)
    }
    this.#expression = expression.trim().split(/\s+/).join(' ')
    return this
  }

  /**
   * @returns Current cron expression.
   */
  getExpression(): string {
    return this.#expression
  }

  /** Run every minute. Cron: `* * * * *`. */
  everyMinute(): this {
    return this.cron('* * * * *')
  }

  /** Run every two minutes. Cron: `*\/2 * * * *`. */
  everyTwoMinutes(): this {
    return this.spliceIntoPosition(0, '*/2')
  }

  /** Run every three minutes. Cron: `*\/3 * * * *`. */
  everyThreeMinutes(): this {
    return this.spliceIntoPosition(0, '*/3')
  }

  /** Run every four minutes. Cron: `*\/4 * * * *`. */
  everyFourMinutes(): this {
    return this.spliceIntoPosition(0, '*/4')
  }

  /** Run every five minutes. Cron: `*\/5 * * * *`. */
  everyFiveMinutes(): this {
    return this.spliceIntoPosition(0, '*/5')
  }

  /** Run every ten minutes. Cron: `*\/10 * * * *`. */
  everyTenMinutes(): this {
    return this.spliceIntoPosition(0, '*/10')
  }

  /** Run every fifteen minutes. Cron: `*\/15 * * * *`. */
  everyFifteenMinutes(): this {
    return this.spliceIntoPosition(0, '*/15')
  }

  /** Run every thirty minutes. Cron: `*\/30 * * * *`. */
  everyThirtyMinutes(): this {
    return this.spliceIntoPosition(0, '*/30')
  }

  /** Run every hour at :00. Cron: `0 * * * *`. */
  hourly(): this {
    return this.spliceIntoPosition(0, '0')
  }

  /** Alias for {@link hourly}. */
  everyHour(): this {
    return this.hourly()
  }

  /**
   * Run every hour at a specific minute.
   *
   * @param minute - Single minute or list of minutes.
   * @returns This instance.
   */
  hourlyAt(minute: number | number[]): this {
    const minutes = Array.isArray(minute) ? minute : [minute]
    const v = minutes.map((m) => String(assertIntRange(m, 0, 59, 'minute'))).join(',')
    return this.spliceIntoPosition(0, v)
  }

  /** Run daily at midnight. Cron: `0 0 * * *`. */
  daily(): this {
    return this.spliceIntoPosition(0, '0').spliceIntoPosition(1, '0')
  }

  /**
   * Run daily at a specific time.
   *
   * @param time - `HH:MM` or `HH:MM:SS`.
   * @returns This instance.
   */
  dailyAt(time: string): this {
    const { hour, minute } = parseTime(time)
    return this.spliceIntoPosition(1, String(hour)).spliceIntoPosition(0, String(minute))
  }

  /** Run weekly on Sunday at 00:00. Cron: `0 0 * * 0`. */
  weekly(): this {
    return this.spliceIntoPosition(0, '0').spliceIntoPosition(1, '0').spliceIntoPosition(4, '0')
  }

  /**
   * Set a time on the current schedule (best effort).
   *
   * @param time - `HH:MM`.
   * @returns This instance.
   */
  at(time: string): this {
    const { hour, minute } = parseTime(time)
    return this.spliceIntoPosition(1, String(hour)).spliceIntoPosition(0, String(minute))
  }

  /**
   * Replace a cron field by index.
   *
   * @param position - 0..4 (minute..dow)
   * @param value - Field value.
   * @returns This instance.
   */
  protected spliceIntoPosition(position: number, value: string): this {
    const parts = this.#expression.split(' ')
    if (parts.length !== 5)
      throw new CronParseError(`Invalid internal expression "${this.#expression}".`)
    parts[position] = value
    const next = parts.join(' ')
    if (!CronExpression.isValid(next))
      throw new CronParseError(`Invalid cron expression "${next}".`)
    this.#expression = next
    return this
  }
}

function assertIntRange(value: number, min: number, max: number, label: string): number {
  if (!Number.isInteger(value))
    throw new CronParseError(`Invalid ${label} "${value}". Expected integer.`)
  if (value < min || value > max)
    throw new CronParseError(`Invalid ${label} "${value}". Expected ${min}-${max}.`)
  return value
}

function parseTime(time: string): { readonly hour: number; readonly minute: number } {
  const m = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(time.trim())
  if (m === null) throw new CronParseError(`Invalid time "${time}". Expected HH:MM.`)
  const hour = Number.parseInt(m[1] ?? '', 10)
  const minute = Number.parseInt(m[2] ?? '', 10)
  assertIntRange(hour, 0, 23, 'hour')
  assertIntRange(minute, 0, 59, 'minute')
  return { hour, minute }
}
