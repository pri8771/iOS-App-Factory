export type SqlMigration = Readonly<{
  version: number;
  name: string;
  sql: string;
  /**
   * Rebuilding a table that other tables reference by foreign key (SQLite has
   * no `ALTER TABLE ... ALTER COLUMN` for CHECK constraints) requires foreign
   * key enforcement to be off for the statement sequence, since SQLite refuses
   * to `DROP TABLE` a referenced parent while enforcement is on. The migration
   * runner disables enforcement only around this migration's transaction, then
   * runs `PRAGMA foreign_key_check` before commit and restores enforcement
   * immediately after, whether or not the migration succeeded.
   */
  disableForeignKeysDuringApply?: boolean;
}>;
