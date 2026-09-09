/**
 * RFC 8785 JSON Canonicalization Scheme (JCS).
 *
 * Canonicalization orders object members and normalizes whitespace, number, and string
 * encodings. Crucially, **JCS never sorts arrays**: an `ordered` array keeps its given
 * order because its order is semantic. `set` arrays are handled as a pre-step (see
 * `canonicalizeSetArray` / `assertCanonicalSetArray`), which is applied *before* JCS —
 * a `set` array must already be sorted and duplicate-free, otherwise the input is
 * rejected. Only after that validation does JCS serialize it.
 *
 * **Member ordering is by UTF-16 code unit, not code point** (RFC 8785 §3.2.3: property
 * names are sorted "by their UTF-16 code units"). The two orders disagree for any pair
 * where one name starts with a surrogate (a non-BMP character, code units `D800`–`DFFF`)
 * and the other with a BMP character above `DFFF` (`E000`–`FFFF`). The canonical example
 * from the RFC's own test vectors is `{"\u{1F600}": …, "": …}`: the emoji's lead
 * surrogate `D83D` is below `E000`, so the emoji sorts **first** under JCS even though
 * its code point `1F600` is far above `E000`.
 *
 * JavaScript's relational operators on strings already compare UTF-16 code units, so
 * `compareByCodeUnit` is the conforming comparator and `String.prototype.localeCompare`
 * (locale-sensitive) is not.
 */

export class JcsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'JcsError';
  }
}

/** Raised when a `set` array is not already sorted and duplicate-free. */
export class SetArrayNotCanonicalError extends JcsError {
  constructor(message: string) {
    super(message);
    this.name = 'SetArrayNotCanonicalError';
  }
}

/**
 * Compare two strings by UTF-16 code unit — the RFC 8785 member-name ordering.
 *
 * This is exactly JavaScript's native string relational ordering; it is spelled out as a
 * named function so every call site (validator, manifest generator, set-array comparator)
 * provably shares one comparator and cannot drift into code-point or locale ordering.
 */
export function compareByCodeUnit(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * Compare two strings by Unicode code point.
 *
 * **Not** the JCS member-name ordering — kept only so the conformance suite can
 * demonstrate the divergence from `compareByCodeUnit` on surrogate-pair keys. Never use
 * it to canonicalize.
 */
export function compareByCodePoint(a: string, b: string): number {
  const ac = Array.from(a, (ch) => ch.codePointAt(0) ?? 0);
  const bc = Array.from(b, (ch) => ch.codePointAt(0) ?? 0);
  const len = Math.min(ac.length, bc.length);
  for (let i = 0; i < len; i++) {
    const ca = ac[i] ?? 0;
    const cb = bc[i] ?? 0;
    if (ca !== cb) return ca < cb ? -1 : 1;
  }
  return ac.length - bc.length;
}

function serializeNumber(value: number): string {
  if (!Number.isFinite(value)) {
    throw new JcsError(`cannot canonicalize non-finite number: ${value}`);
  }
  if (Object.is(value, -0)) return '0';
  // RFC 8785 serializes numbers per ECMAScript number-to-string, which emits lowercase
  // 'e' and keeps the '+' sign for positive exponents (e.g. `1e+21`, `1e-7`).
  return String(value);
}

/**
 * Serialize a JSON string literal per RFC 8785 §3.2.2.2.
 *
 * `JSON.stringify` already implements the required escaping (shortest form, lowercase
 * `\uXXXX` for control characters, no escaping of non-ASCII) since ES2019's
 * well-formed-JSON.stringify, including lone surrogates as `\udXXX`.
 */
function serializeString(value: string): string {
  return JSON.stringify(value);
}

function serializeObject(value: Record<string, unknown>): string {
  const keys = Object.keys(value).sort(compareByCodeUnit);
  const parts = keys.map((key) => `${serializeString(key)}:${serialize(value[key])}`);
  return `{${parts.join(',')}}`;
}

function serializeArray(value: unknown[]): string {
  const parts: string[] = [];
  for (let i = 0; i < value.length; i++) {
    parts.push(serialize(value[i]));
  }
  return `[${parts.join(',')}]`;
}

function serialize(value: unknown): string {
  if (value === null) return 'null';
  switch (typeof value) {
    case 'string':
      return serializeString(value);
    case 'number':
      return serializeNumber(value);
    case 'boolean':
      return value ? 'true' : 'false';
    case 'object':
      return Array.isArray(value)
        ? serializeArray(value)
        : serializeObject(value as Record<string, unknown>);
    default:
      throw new JcsError(`cannot canonicalize value of type ${typeof value}`);
  }
}

/** Serialize a JSON value to its canonical (JCS) string form. Arrays are never sorted. */
export function jcs(value: unknown): string {
  return serialize(value);
}

/** Alias for `jcs`, named for consumers that speak "canonical JSON" rather than "JCS". */
export const canonicalizeJson = jcs;

/** Serialize a JSON value to canonical UTF-8 bytes. */
export function jcsBytes(value: unknown): Uint8Array {
  return new TextEncoder().encode(jcs(value));
}

/** Derive a sort key for a `set` array element. */
export type SetArrayKey<T> = (item: T) => string;

/**
 * Canonicalize a `set` array: sort by key and remove duplicates by key. Used by producers
 * to build a canonical, digest-stable representation. For ID string arrays, omit `key` to
 * sort lexically by code unit.
 */
export function canonicalizeSetArray<T>(items: readonly T[], key?: SetArrayKey<T>): T[] {
  const toKey = key ?? ((item: T) => String(item));
  const sorted = [...items].sort((a, b) => compareByCodeUnit(toKey(a), toKey(b)));
  const result: T[] = [];
  for (const item of sorted) {
    const prev = result[result.length - 1];
    if (prev === undefined || toKey(prev) !== toKey(item)) {
      result.push(item);
    }
  }
  return result;
}

/**
 * Assert that a `set` array is already sorted and duplicate-free (by key). Throws
 * `SetArrayNotCanonicalError` otherwise — an unsorted or duplicate `set` array is
 * rejected before JCS serialization.
 */
export function assertCanonicalSetArray<T>(items: readonly T[], key?: SetArrayKey<T>): void {
  const toKey = key ?? ((item: T) => String(item));
  for (let i = 0; i < items.length; i++) {
    if (i === 0) continue;
    const prev = items[i - 1] as T;
    const curr = items[i] as T;
    const cmp = compareByCodeUnit(toKey(prev), toKey(curr));
    if (cmp > 0) {
      throw new SetArrayNotCanonicalError('set array is not sorted');
    }
    if (cmp === 0) {
      throw new SetArrayNotCanonicalError('set array contains duplicates');
    }
  }
}
