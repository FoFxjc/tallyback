import { describe, expect, it } from 'vitest';

import {
  assertCanonicalSetArray,
  canonicalizeJson,
  canonicalizeSetArray,
  compareByCodePoint,
  DIGEST_ALGORITHM,
  digest,
  isDigest,
  isValidId,
  jcs,
  jcsBytes,
  parseId,
  prefixOf,
  SetArrayNotCanonicalError,
  sha256Hex,
  isUuidV7,
} from '../src/contract/index.js';

describe('JCS canonicalization (RFC 8785)', () => {
  it('orders object members by Unicode code point', () => {
    expect(jcs({ b: 1, a: 2 })).toBe('{"a":2,"b":1}');
  });

  it('sorts nested objects recursively', () => {
    expect(jcs({ z: 'x', a: { y: 2, b: 1 } })).toBe('{"a":{"b":1,"y":2},"z":"x"}');
  });

  it('never sorts arrays (order is semantic)', () => {
    expect(jcs([3, 1, 2])).toBe('[3,1,2]');
    expect(jcs({ list: [2, 1] })).toBe('{"list":[2,1]}');
  });

  it('normalizes number and string encodings', () => {
    expect(jcs(-0)).toBe('0');
    expect(jcs(1e21)).toBe('1e+21');
    expect(jcs(0.5)).toBe('0.5');
    expect(jcs('a"b')).toBe('"a\\"b"');
  });

  it('serializes null and booleans', () => {
    expect(jcs(null)).toBe('null');
    expect(jcs(true)).toBe('true');
    expect(jcs(false)).toBe('false');
  });

  it('rejects non-finite numbers', () => {
    expect(() => jcs(Number.NaN)).toThrow();
    expect(() => jcs(Infinity)).toThrow();
  });

  it('exposes canonicalizeJson as an alias', () => {
    expect(canonicalizeJson({ b: 1, a: 2 })).toBe(jcs({ b: 1, a: 2 }));
  });

  it('emits canonical UTF-8 bytes', () => {
    const bytes = jcsBytes({ b: 1, a: 2 });
    expect(new TextDecoder().decode(bytes)).toBe('{"a":2,"b":1}');
  });
});

describe('canonical set arrays', () => {
  it('sorts and dedupes by key', () => {
    expect(canonicalizeSetArray(['c', 'a', 'b'])).toEqual(['a', 'b', 'c']);
    expect(canonicalizeSetArray(['a', 'a', 'b'])).toEqual(['a', 'b']);
  });

  it('asserts a set array is already sorted and duplicate-free', () => {
    expect(() => assertCanonicalSetArray(['a', 'b', 'c'])).not.toThrow();
    expect(() => assertCanonicalSetArray(['b', 'a'])).toThrow(SetArrayNotCanonicalError);
    expect(() => assertCanonicalSetArray(['a', 'a'])).toThrow(SetArrayNotCanonicalError);
  });

  it('compares by code point', () => {
    expect(compareByCodePoint('a', 'b')).toBeLessThan(0);
    expect(compareByCodePoint('b', 'a')).toBeGreaterThan(0);
    expect(compareByCodePoint('a', 'a')).toBe(0);
  });
});

describe('shared digest', () => {
  const SHA256_ABC = 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad';

  it('computes the SHA-256 hex of known bytes', () => {
    expect(sha256Hex('abc')).toBe(SHA256_ABC);
  });

  it('wraps the digest in the shared object shape (never a bare hash)', () => {
    const d = digest('abc');
    expect(d.algorithm).toBe('sha-256');
    expect(d.value).toMatch(/^[0-9a-f]{64}$/);
    // digest(value) hashes the JCS canonical bytes of the value: a string is
    // hashed as its JSON encoding (with quotes), not as raw bytes.
    expect(d.value).toBe(sha256Hex('"abc"'));
    expect(DIGEST_ALGORITHM).toBe('sha-256');
  });

  it('validates digest objects', () => {
    expect(isDigest({ algorithm: 'sha-256', value: 'a'.repeat(64) })).toBe(true);
    expect(isDigest({ algorithm: 'sha-256', value: 'xyz' })).toBe(false);
    expect(isDigest({ algorithm: 'md5', value: 'a'.repeat(64) })).toBe(false);
    expect(isDigest('ba7816bf')).toBe(false);
    expect(isDigest(null)).toBe(false);
  });
});

describe('canonical identifiers', () => {
  const GOOD = 'prj_0190b1c0-0000-7000-8000-000000000001';

  it('accepts valid <prefix>_<UUIDv7> ids', () => {
    expect(isValidId(GOOD)).toBe(true);
    expect(isValidId('cri_0190b1c0-0000-7000-8000-000000000001')).toBe(true);
  });

  it('rejects malformed and foreign-prefixed ids', () => {
    expect(isValidId('prj_not-a-uuid')).toBe(false);
    expect(isValidId('foo_0190b1c0-0000-7000-8000-000000000001')).toBe(false);
    // version nibble must be 7
    expect(isValidId('prj_0190b1c0-0000-6000-8000-000000000001')).toBe(false);
    // variant nibble must be 8/9/a/b
    expect(isValidId('prj_0190b1c0-0000-7000-c000-000000000001')).toBe(false);
  });

  it('parses prefix and uuid', () => {
    expect(prefixOf(GOOD)).toBe('prj_');
    expect(parseId(GOOD)).toEqual({ prefix: 'prj_', uuid: '0190b1c0-0000-7000-8000-000000000001' });
    expect(parseId('nope')).toBeNull();
  });

  it('recognizes the UUIDv7 shape', () => {
    expect(isUuidV7('0190b1c0-0000-7000-8000-000000000001')).toBe(true);
    expect(isUuidV7('0190b1c0-0000-7000-7000-000000000001')).toBe(false);
    expect(isUuidV7('0190b1c0-0000-7000-8000-00000000000g')).toBe(false);
  });
});
