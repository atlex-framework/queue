import type { ShouldBeUnique } from './ShouldBeUnique.js'

/**
 * Like ShouldBeUnique but the lock is released when the job starts processing.
 */
export interface ShouldBeUniqueUntilProcessing extends ShouldBeUnique {}
