/**
 * Shared CLI error type. Kept in its own module so command-specific parsers
 * (for example task-new.ts) can throw it without an import cycle back
 * through index.ts.
 */
export class CliUsageError extends Error {
  public constructor(message: string, options: ErrorOptions = {}) {
    super(message, options);
    this.name = "CliUsageError";
  }
}
