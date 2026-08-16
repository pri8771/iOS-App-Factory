import type { RoomPersona } from "@app-factory/contracts";

const MENTION_PATTERN = /(?:^|[^A-Za-z0-9_@])@([a-z][a-z0-9-]{0,63})(?![a-z0-9-])/g;

/**
 * `@persona` tokens that name a room participant, in first-mention order,
 * de-duplicated. Only known participants count: a stray `@someone` in prose
 * is not a forced invite for anyone.
 */
export function parseMentions(
  body: string,
  participants: readonly RoomPersona[],
): readonly RoomPersona[] {
  const known = new Set<string>(participants);
  const mentioned: RoomPersona[] = [];
  const seen = new Set<string>();
  for (const match of body.matchAll(MENTION_PATTERN)) {
    const persona = match[1];
    if (persona === undefined || !known.has(persona) || seen.has(persona)) continue;
    seen.add(persona);
    mentioned.push(persona as RoomPersona);
  }
  return mentioned;
}
