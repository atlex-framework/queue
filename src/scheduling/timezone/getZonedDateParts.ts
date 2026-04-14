export interface ZonedDateParts {
  readonly minute: number
  readonly hour: number
  readonly dayOfMonth: number
  readonly month: number
  readonly dayOfWeek: number // 0=Sun..6=Sat (also may be 7 for Sun depending on caller normalization)
}

/**
 * Extract cron-relevant date parts in a target IANA timezone.
 *
 * @param date - Source Date.
 * @param timezone - IANA timezone (e.g. `UTC`, `America/New_York`). If omitted, uses runtime local timezone.
 * @returns ZonedDateParts.
 */
export function getZonedDateParts(date: Date, timezone?: string): ZonedDateParts {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    weekday: 'short',
  })

  const parts = dtf.formatToParts(date)

  let month: number | null = null
  let day: number | null = null
  let hour: number | null = null
  let minute: number | null = null
  let weekday: string | null = null

  for (const p of parts) {
    if (p.type === 'month') month = toInt(p.value)
    if (p.type === 'day') day = toInt(p.value)
    if (p.type === 'hour') hour = toInt(p.value) % 24 // Intl returns 24 for midnight on Linux
    if (p.type === 'minute') minute = toInt(p.value)
    if (p.type === 'weekday') weekday = p.value
  }

  if (month === null || day === null || hour === null || minute === null || weekday === null) {
    throw new Error('Failed to derive zoned date parts from Intl.DateTimeFormat.')
  }

  return {
    minute,
    hour,
    dayOfMonth: day,
    month,
    dayOfWeek: weekdayToDow(weekday),
  }
}

function toInt(v: string): number {
  const n = Number.parseInt(v, 10)
  if (!Number.isFinite(n)) throw new Error(`Invalid numeric date part: ${v}`)
  return n
}

function weekdayToDow(weekday: string): number {
  // `en-US` short weekdays: Sun, Mon, Tue, Wed, Thu, Fri, Sat
  switch (weekday) {
    case 'Sun':
      return 0
    case 'Mon':
      return 1
    case 'Tue':
      return 2
    case 'Wed':
      return 3
    case 'Thu':
      return 4
    case 'Fri':
      return 5
    case 'Sat':
      return 6
    default:
      throw new Error(`Unknown weekday token: ${weekday}`)
  }
}
