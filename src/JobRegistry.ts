import { JobNotFoundError } from './errors/JobNotFoundError.js'
import type { Job } from './Job.js'

type JobConstructor = new (...args: readonly unknown[]) => Job

export class JobRegistry {
  private static readonly registry = new Map<string, JobConstructor>()

  /**
   * Register a job class by name.
   *
   * @param name - Registry name (typically the class name).
   * @param constructor - Job class constructor.
   */
  public static register(name: string, constructor: JobConstructor): void {
    if (name.trim().length === 0) {
      throw new Error('JobRegistry.register: name is required.')
    }
    this.registry.set(name, constructor)
  }

  /**
   * Resolve a job constructor by name.
   *
   * @throws JobNotFoundError when not registered.
   */
  public static resolve(name: string): JobConstructor {
    const ctor = this.registry.get(name)
    if (ctor === undefined) {
      throw new JobNotFoundError(name)
    }
    return ctor
  }

  /**
   * Check if a job name is registered.
   */
  public static has(name: string): boolean {
    return this.registry.has(name)
  }

  /**
   * Get all registered job names.
   */
  public static all(): string[] {
    return [...this.registry.keys()]
  }

  /**
   * Clear the registry (primarily for tests).
   */
  public static flush(): void {
    this.registry.clear()
  }
}

/**
 * Class decorator that auto-registers a job class.
 *
 * @param name - Optional registry name override.
 */
export function RegisterJob(name?: string): ClassDecorator {
  return (target) => {
    const ctor = target as unknown as JobConstructor
    const resolvedName = (name ?? ctor.name).trim()
    JobRegistry.register(resolvedName, ctor)
  }
}
