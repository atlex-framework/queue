export interface Monitor {
  /**
   * Called with queue sizes for monitoring/alerting.
   */
  report(snapshot: readonly { connection: string; queue: string; size: number }[]): Promise<void>
}
