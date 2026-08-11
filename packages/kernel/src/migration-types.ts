export type SqlMigration = Readonly<{
  version: number;
  name: string;
  sql: string;
}>;
