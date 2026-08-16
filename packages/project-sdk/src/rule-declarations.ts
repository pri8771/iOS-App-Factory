/**
 * Single-line rule-declaration grammar shared by the read-only scanner and the plan-apply
 * executor.
 *
 * The scanner uses it to inventory machine-checkable declarations; the executor uses it to
 * locate the exact lines the scanner would treat as an adapter's authority binding before
 * rewriting them. Sharing one matcher (rather than a private re-implementation in the executor)
 * guarantees the two agree on both accepted spellings — `factory-rule: key=value` and
 * `factory.rule.key=value`, optionally bulleted, case-insensitive — so an executor edit can never
 * leave behind a line the scanner still parses as a declaration.
 */

const RULE_DECLARATION_PATTERN =
  /^\s*(?:[-*]\s*)?(?:factory-rule\s*:?\s+|factory\.rule\.)([a-z][a-z0-9]*(?:[._-][a-z0-9]+)*)\s*=\s*(\S(?:.*\S)?)\s*$/iu;

export type RuleDeclarationLine = Readonly<{ key: string; value: string }>;

/** Returns the lower-cased key and raw value when `line` is a rule declaration, else `null`. */
export function parseRuleDeclarationLine(line: string): RuleDeclarationLine | null {
  const match = RULE_DECLARATION_PATTERN.exec(line);
  const key = match?.[1];
  const value = match?.[2];
  return key !== undefined && value !== undefined ? { key: key.toLowerCase(), value } : null;
}
