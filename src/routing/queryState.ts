import type { LocationQuery, LocationQueryRaw, LocationQueryValueRaw } from "vue-router";

export const SNAPSHOT_QUERY_KEY = "state";

export type QueryRecord = Readonly<Record<string, unknown>>;

export function queryValue(value: unknown): string | undefined {
  const candidate = Array.isArray(value) ? value[0] : value;
  return typeof candidate === "string" ? candidate : undefined;
}

export function queryValues(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === "string");
  return typeof value === "string" ? [value] : [];
}

export function queryText(value: unknown, maxLength = 200): string | undefined {
  const candidate = queryValue(value);
  return candidate === undefined ? undefined : candidate.slice(0, Math.max(0, maxLength));
}

export function queryEnum<T extends string>(
  value: unknown,
  allowed: ReadonlySet<T>,
): T | undefined {
  const candidate = queryValue(value);
  return candidate !== undefined && allowed.has(candidate as T) ? candidate as T : undefined;
}

export function queryInteger(value: unknown, min: number, max: number): number | undefined {
  const candidate = queryValue(value);
  if (candidate === undefined || !candidate.trim()) return undefined;
  const parsed = Number(candidate);
  if (!Number.isSafeInteger(parsed)) return undefined;
  return Math.min(max, Math.max(min, parsed));
}

export function decodeChoiceQuery(value: unknown, maxLength = 160): Record<string, string> {
  const choices = new Map<string, string>();
  for (const token of queryValues(value)) {
    const separator = token.indexOf(":");
    if (separator <= 0) continue;
    const itemId = token.slice(0, separator).slice(0, maxLength);
    const recipeId = token.slice(separator + 1).slice(0, maxLength);
    if (itemId && recipeId) choices.set(itemId, recipeId);
  }
  return Object.fromEntries([...choices].sort(([left], [right]) => left.localeCompare(right, "en")));
}

export function encodeChoiceQuery(choices: Readonly<Record<string, string>>): string[] {
  return Object.entries(choices)
    .filter(([itemId, recipeId]) => Boolean(itemId && recipeId))
    .sort(([left], [right]) => left.localeCompare(right, "en"))
    .map(([itemId, recipeId]) => `${itemId}:${recipeId}`);
}

export function isSnapshotQuery(query: QueryRecord): boolean {
  return queryValue(query[SNAPSHOT_QUERY_KEY]) === "1";
}

export function snapshotQuery(
  fields: Readonly<Record<string, LocationQueryValueRaw | LocationQueryValueRaw[] | undefined>>,
): LocationQueryRaw {
  const query: LocationQueryRaw = { [SNAPSHOT_QUERY_KEY]: "1" };
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined || value === null || value === "") continue;
    if (Array.isArray(value) && !value.length) continue;
    query[key] = value;
  }
  return query;
}

function queryPairs(query: LocationQuery | LocationQueryRaw): string[] {
  return Object.entries(query).flatMap(([key, rawValue]) => {
    const values = Array.isArray(rawValue) ? rawValue : [rawValue];
    return values.flatMap((value) => {
      if (value === null) return [`${key}\u0000<null>`];
      return typeof value === "string" || typeof value === "number"
        ? [`${key}\u0000${String(value)}`] : [];
    });
  });
}

export function queriesEqual(current: LocationQuery, next: LocationQueryRaw): boolean {
  const left = queryPairs(current);
  const right = queryPairs(next);
  return left.length === right.length && left.every((value, index) => value === right[index]);
}
