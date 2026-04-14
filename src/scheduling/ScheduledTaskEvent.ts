/**
 * Base class for scheduled task events.
 */
export abstract class ScheduledTaskEvent {
  /**
   * Execute the event.
   *
   * @returns Captured output (may be empty).
   */
  abstract run(): Promise<string>

  /**
   * Get a human-readable summary for `schedule:list`.
   *
   * @returns Summary string.
   */
  abstract getSummary(): string
}
