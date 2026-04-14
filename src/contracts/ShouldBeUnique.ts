export interface ShouldBeUnique {
  uniqueId(): string
  /**
   * Seconds the lock is held for.
   */
  readonly uniqueFor?: number
}
