import { CronParseError } from './errors/CronParseError.js'
import { getZonedDateParts, type ZonedDateParts } from './timezone/getZonedDateParts.js'

type CronFieldName = 'minute' | 'hour' | 'dayOfMonth' | 'month' | 'dayOfWeek'

interface CronFieldRange {
  readonly min: number
  readonly max: number
}

const CRON_RANGES: Record<CronFieldName, CronFieldRange> = {
  minute: { min: 0, max: 59 },
  hour: { min: 0, max: 23 },
  dayOfMonth: { min: 1, max: 31 },
  month: { min: 1, max: 12 },
  dayOfWeek: { min: 0, max: 7 },
} as const

interface CompiledCron {
  readonly minute: ReadonlySet<number>
  readonly hour: ReadonlySet<number>
  readonly dayOfMonth: ReadonlySet<number>
  readonly month: ReadonlySet<number>
  readonly dayOfWeek: ReadonlySet<number>
}

/**
 * Cron expression parser + evaluator (5-field cron).
 *
 * Supported tokens per field:
 * - `*`
 * - `*\/N`
 * - `N`
 * - `N-M`
 * - `N,M,O` lists (any mix of the above, excluding nested steps)
 */
export class CronExpression {
  readonly #expression: string
  readonly #compiled: CompiledCron

  private constructor(expression: string, compiled: CompiledCron) {
    this.#expression = expression
    this.#compiled = compiled
  }

  /**
   * Parse and validate a cron expression (5 fields).
   *
   * @param expression - Cron string in the form `m h dom mon dow`.
   * @returns Parsed CronExpression instance.
   * @throws {CronParseError} When the expression is invalid.
   */
  static parse(expression: string): CronExpression {
    const parts = expression.trim().split(/\s+/)
    if (parts.length !== 5) {
      throw new CronParseError(`Invalid cron expression "${expression}". Expected 5 fields.`)
    }

    const [minuteRaw, hourRaw, domRaw, monthRaw, dowRaw] = parts as [
      string,
      string,
      string,
      string,
      string,
    ]
    const compiled: CompiledCron = {
      minute: compileField('minute', minuteRaw),
      hour: compileField('hour', hourRaw),
      dayOfMonth: compileField('dayOfMonth', domRaw),
      month: compileField('month', monthRaw),
      dayOfWeek: compileField('dayOfWeek', dowRaw),
    }

    return new CronExpression(parts.join(' '), compiled)
  }

  /**
   * Validate a cron expression string.
   *
   * @param expression - Candidate cron expression.
   * @returns True if valid.
   */
  static isValid(expression: string): boolean {
    try {
      CronExpression.parse(expression)
      return true
    } catch {
      return false
    }
  }

  /**
   * Check if the expression matches a given Date.
   *
   * @param date - The date to test.
   * @param timezone - Optional IANA timezone (e.g. `UTC`, `America/New_York`).
   * @returns True if the date matches.
   */
  matches(date: Date, timezone?: string): boolean {
    const parts = getZonedDateParts(date, timezone)
    return this.#matchesParts(parts)
  }

  /**
   * Calculate the next occurrence after a given Date (minute precision).
   *
   * @param after - Base date (defaults to now).
   * @param timezone - Optional timezone for evaluation.
   * @returns Next run date (in real Date/UTC time).
   * @throws {CronParseError} When no next run can be found within a safe bound.
   */
  nextRun(after: Date = new Date(), timezone?: string): Date {
    const start = roundToNextMinute(after)
    return this.#search(start, +1, timezone)
  }

  /**
   * Calculate the previous occurrence before a given Date (minute precision).
   *
   * @param before - Base date (defaults to now).
   * @param timezone - Optional timezone for evaluation.
   * @returns Previous run date.
   * @throws {CronParseError} When no previous run can be found within a safe bound.
   */
  previousRun(before: Date = new Date(), timezone?: string): Date {
    const start = roundToPreviousMinute(before)
    return this.#search(start, -1, timezone)
  }

  /**
   * Get a human-readable description (best-effort).
   *
   * @returns Human readable summary.
   */
  describe(): string {
    if (this.#expression === '* * * * *') return 'Every minute'
    const [m, h, dom, mon, dow] = this.#expression.split(' ')
    if (m === undefined) {
      return this.#expression
    }
    if (m.startsWith('*/') && h === '*' && dom === '*' && mon === '*' && dow === '*') {
      return `Every ${m.slice(2)} minutes`
    }
    if (m === '0' && h === '*' && dom === '*' && mon === '*' && dow === '*') return 'Hourly'
    if (m === '0' && h === '0' && dom === '*' && mon === '*' && dow === '*') return 'Daily'
    if (m === '0' && h === '0' && dom === '*' && mon === '*' && (dow === '0' || dow === '7'))
      return 'Weekly'
    return this.#expression
  }

  /**
   * Get the raw cron string.
   *
   * @returns Expression string.
   */
  toString(): string {
    return this.#expression
  }

  /**
   * @returns Minute field.
   */
  getMinuteField(): string {
    return this.#expression.split(' ')[0] ?? '*'
  }

  /**
   * @returns Hour field.
   */
  getHourField(): string {
    return this.#expression.split(' ')[1] ?? '*'
  }

  /**
   * @returns Day-of-month field.
   */
  getDayOfMonthField(): string {
    return this.#expression.split(' ')[2] ?? '*'
  }

  /**
   * @returns Month field.
   */
  getMonthField(): string {
    return this.#expression.split(' ')[3] ?? '*'
  }

  /**
   * @returns Day-of-week field.
   */
  getDayOfWeekField(): string {
    return this.#expression.split(' ')[4] ?? '*'
  }

  #matchesParts(parts: ZonedDateParts): boolean {
    const dow = parts.dayOfWeek === 7 ? 0 : parts.dayOfWeek // normalize Sunday 7 → 0
    const dowAlt = parts.dayOfWeek === 0 ? 7 : parts.dayOfWeek // allow 0 and 7 for Sunday
    const dowSet = this.#compiled.dayOfWeek

    return (
      this.#compiled.minute.has(parts.minute) &&
      this.#compiled.hour.has(parts.hour) &&
      this.#compiled.dayOfMonth.has(parts.dayOfMonth) &&
      this.#compiled.month.has(parts.month) &&
      (dowSet.has(dow) || dowSet.has(dowAlt))
    )
  }

  #search(start: Date, direction: 1 | -1, timezone?: string): Date {
    // Safe bound: ~5 years of minute checks.
    const maxIterations = 60 * 24 * 366 * 5
    let current = new Date(start.getTime())
    for (let i = 0; i < maxIterations; i += 1) {
      const parts = getZonedDateParts(current, timezone)
      if (this.#matchesParts(parts)) return current
      current = new Date(current.getTime() + direction * 60_000)
    }
    throw new CronParseError(
      `Could not find a matching run time for "${this.#expression}" within search bounds.`,
    )
  }
}

function roundToNextMinute(d: Date): Date {
  const t = d.getTime()
  const ms = t % 60_000
  const next = ms === 0 ? t + 60_000 : t + (60_000 - ms)
  return new Date(next)
}

function roundToPreviousMinute(d: Date): Date {
  const t = d.getTime()
  const ms = t % 60_000
  const prev = t - ms - 60_000
  return new Date(prev)
}

function compileField(field: CronFieldName, raw: string): ReadonlySet<number> {
  const { min, max } = CRON_RANGES[field]
  const tokens = raw.split(',')
  const set = new Set<number>()

  for (const tokenRaw of tokens) {
    const token = tokenRaw.trim()
    if (token.length === 0) throw new CronParseError(`Invalid ${field} field: empty token.`)

    if (token === '*') {
      for (let v = min; v <= max; v += 1) set.add(v)
      continue
    }

    if (token.startsWith('*/')) {
      const n = parseIntStrict(token.slice(2), `${field} step`)
      if (n <= 0) throw new CronParseError(`Invalid ${field} step "${token}".`)
      for (let v = min; v <= max; v += n) set.add(v)
      continue
    }

    if (token.includes('-')) {
      const [aRaw, bRaw] = token.split('-')
      if (aRaw === undefined || bRaw === undefined)
        throw new CronParseError(`Invalid ${field} range "${token}".`)
      const a = parseIntStrict(aRaw, `${field} range start`)
      const b = parseIntStrict(bRaw, `${field} range end`)
      if (a > b) throw new CronParseError(`Invalid ${field} range "${token}". Start > end.`)
      assertInRange(field, a)
      assertInRange(field, b)
      for (let v = a; v <= b; v += 1) set.add(v)
      continue
    }

    const single = parseIntStrict(token, `${field} value`)
    assertInRange(field, single)
    set.add(single)
  }

  if (set.size === 0) throw new CronParseError(`Invalid ${field} field "${raw}". No values.`)
  return set
}

function assertInRange(field: CronFieldName, value: number): void {
  const { min, max } = CRON_RANGES[field]
  if (value < min || value > max) {
    throw new CronParseError(`Invalid ${field} value "${value}". Expected ${min}-${max}.`)
  }
}

function parseIntStrict(value: string, label: string): number {
  const n = Number.parseInt(value, 10)
  if (!Number.isFinite(n) || String(n) !== value.trim()) {
    throw new CronParseError(`Invalid ${label} "${value}".`)
  }
  return n
}
