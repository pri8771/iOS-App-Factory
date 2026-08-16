/**
 * Machine-checkable `factory-rule:` declarations.
 *
 * The project scanner (`@app-factory/project-sdk`) treats a root `AGENTS.md` as a canonical
 * authority only when it carries at least one parsable `factory-rule: <key>=<value>` line, and
 * treats a tool adapter as conforming only when it declares `authority.import=<canonical path>`
 * and `authority.digest=<sha256 of that canonical file>`. Prose alone is never conforming.
 *
 * The compiler therefore emits these declarations itself so that a compiled bundle is both
 * digest-locked (policy engine) and enrollable (project scanner) without a second writer.
 *
 * Declaration keys must be unique per file: the scanner reports two different values for one
 * key at the same scope as a conflicting-declaration blocker. Rule identifiers are unique by
 * schema, so per-rule keys cannot collide, and the authority never declares
 * `authority.import` / `authority.digest`, which are reserved for adapters.
 */

const DECLARATION_PREFIX = "factory-rule: ";

/** The `authority.version` value shared with the project scanner's own establishment block. */
export const AUTHORITY_DECLARATION_VERSION = 1;

export type PolicyDeclarationInputV1 = Readonly<{
  policyId: string;
  policyVersion: number;
  rules: ReadonlyArray<
    Readonly<{
      ruleId: string;
      enforcement: string;
      requiredCheck: string;
    }>
  >;
}>;

export type PolicyDeclarationV1 = Readonly<{ key: string; value: string }>;

function declarationLine(declaration: PolicyDeclarationV1): string {
  return `${DECLARATION_PREFIX}${declaration.key}=${declaration.value}`;
}

/**
 * Declarations carried by the canonical authority file, in a stable order:
 * authority marker, policy identity, then one enforcement/check pair per rule in source order.
 */
export function authorityDeclarations(
  source: PolicyDeclarationInputV1,
  sourceDigest: string,
): readonly PolicyDeclarationV1[] {
  return [
    { key: "authority.version", value: String(AUTHORITY_DECLARATION_VERSION) },
    { key: "policy.id", value: source.policyId },
    { key: "policy.version", value: String(source.policyVersion) },
    { key: "policy.digest", value: sourceDigest },
    ...source.rules.flatMap((rule) => [
      { key: `${rule.ruleId}.enforcement`, value: rule.enforcement },
      { key: `${rule.ruleId}.check`, value: rule.requiredCheck },
    ]),
  ];
}

/** Declarations that bind a client adapter to its canonical authority file. */
export function adapterBindingDeclarations(
  authorityPath: string,
  authorityDigest: string,
): readonly PolicyDeclarationV1[] {
  return [
    { key: "authority.import", value: authorityPath },
    { key: "authority.digest", value: authorityDigest },
  ];
}

export function renderAuthorityDeclarationsSection(
  source: PolicyDeclarationInputV1,
  sourceDigest: string,
): string {
  const lines = authorityDeclarations(source, sourceDigest).map(declarationLine).join("\n");
  return `## Machine-checkable declarations\n\nThe \`factory-rule:\` lines below are parsed by the App Factory project scanner and broker.\nClient adapters bind to this file by \`authority.import\` and \`authority.digest\`.\n\n${lines}\n`;
}

export function renderAdapterBinding(authorityPath: string, authorityDigest: string): string {
  return `${adapterBindingDeclarations(authorityPath, authorityDigest).map(declarationLine).join("\n")}\n`;
}
