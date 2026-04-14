import { execFile as execFileCb } from 'node:child_process'
import { promisify } from 'node:util'

import { ScheduledTaskEvent } from '../ScheduledTaskEvent.js'

const execFileAsync = promisify(execFileCb)

export interface ConsoleCommandEventOptions {
  /** Working directory for the child process (default: `process.cwd()`). */
  readonly cwd?: string
  /**
   * Path to the Atlex CLI entry script.
   * Default: `process.env['ATLEX_CLI_ENTRY']` or `process.argv[1]` (when invoked via `node …/atlex`).
   */
  readonly cliEntry?: string
}

function splitCommandLine(command: string): string[] {
  return command
    .trim()
    .split(/\s+/u)
    .filter((t) => t.length > 0)
}

function resolveCliEntry(explicit?: string): string {
  if (typeof explicit === 'string' && explicit.trim().length > 0) return explicit.trim()
  const fromEnv = process.env.ATLEX_CLI_ENTRY
  if (typeof fromEnv === 'string' && fromEnv.trim().length > 0) return fromEnv.trim()
  const argv1 = process.argv[1]
  if (typeof argv1 === 'string' && argv1.trim().length > 0) return argv1.trim()
  return ''
}

/**
 * Runs an Atlex console command in a subprocess (`node <cliEntry> <args…>`).
 */
export class ConsoleCommandEvent extends ScheduledTaskEvent {
  readonly #args: string[]
  readonly #cwd: string
  readonly #cliEntry: string
  readonly #display: string

  /**
   * @param command - Console command and arguments as a single string (e.g. `example:command` or `db:seed --class=Foo`).
   * @param options - Optional cwd and CLI entry path.
   */
  constructor(command: string, options?: ConsoleCommandEventOptions) {
    super()
    this.#args = splitCommandLine(command)
    if (this.#args.length === 0) {
      throw new Error('Scheduled console command cannot be empty.')
    }
    this.#cwd =
      typeof options?.cwd === 'string' && options.cwd.trim().length > 0
        ? options.cwd
        : process.cwd()
    this.#cliEntry = resolveCliEntry(options?.cliEntry)
    this.#display = this.#args.join(' ')
  }

  override async run(): Promise<string> {
    if (this.#cliEntry.length === 0) {
      throw new Error(
        'Cannot run scheduled console command: set ATLEX_CLI_ENTRY to the atlex CLI script, or run the scheduler via the atlex binary so argv[1] is set.',
      )
    }
    const result = await execFileAsync(process.execPath, [this.#cliEntry, ...this.#args], {
      cwd: this.#cwd,
      encoding: 'utf8',
      maxBuffer: 10 * 1024 * 1024,
    })
    const stdout = String(result.stdout ?? '')
    const stderr = String(result.stderr ?? '')
    const out = (stdout ?? '').trim()
    const err = (stderr ?? '').trim()
    if (out.length > 0) return out
    if (err.length > 0) return err
    return ''
  }

  override getSummary(): string {
    return `Command: ${this.#display}`
  }
}
