import { AtlexError } from '@atlex/core'

/**
 * Thrown when a cron expression cannot be parsed or evaluated.
 */
export class CronParseError extends AtlexError {
  /**
   * @param message - Error message.
   */
  constructor(message: string) {
    super(message, 'SCHEDULE_CRON_PARSE_ERROR')
    this.name = 'CronParseError'
  }
}
