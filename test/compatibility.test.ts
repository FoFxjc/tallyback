import { describe, expect, it } from 'vitest';

import {
  COMMAND_API_VERSION,
  CONTRACT_NAME,
  FEATURE_INTERFACES,
  handshake,
  IMPLEMENTATION_VERSION,
  SUPPORTED_CONTRACT_VERSIONS,
  canMutateContractVersion,
  supportsContractMajor,
} from '../src/version.js';

describe('capability handshake', () => {
  it('declares the contract, versions, and provider interfaces', () => {
    const h = handshake();
    expect(h.contract).toBe(CONTRACT_NAME);
    expect(h.contract).toBe('tallyback');
    expect(h.implementation_version).toBe(IMPLEMENTATION_VERSION);
    expect(h.command_api_version).toBe(COMMAND_API_VERSION);
    expect(h.supported_contract_versions).toEqual(['1.0.0']);
    expect(h.features).toEqual(['store', 'check', 'migration', 'land', 'view', 'watch']);
  });

  it('returns a defensive copy (mutating the result does not leak state)', () => {
    const first = handshake();
    first.supported_contract_versions.push('9.9.9');
    first.features.push('rogue');
    expect(handshake().supported_contract_versions).toEqual(['1.0.0']);
    expect(handshake().features).toEqual(FEATURE_INTERFACES);
  });
});

describe('contract version gating', () => {
  it('accepts any version with a supported major for read/parse', () => {
    expect(supportsContractMajor('1.0.0')).toBe(true);
    expect(supportsContractMajor('1.5.0')).toBe(true);
  });

  it('fails closed on an unknown major', () => {
    expect(supportsContractMajor('2.0.0')).toBe(false);
    expect(supportsContractMajor('garbage')).toBe(false);
    expect(supportsContractMajor('')).toBe(false);
  });

  it('requires an exact supported version to mutate', () => {
    expect(canMutateContractVersion('1.0.0')).toBe(true);
    expect(canMutateContractVersion(' 1.0.0 ')).toBe(true);
    expect(canMutateContractVersion('1.5.0')).toBe(false);
    expect(canMutateContractVersion('2.0.0')).toBe(false);
  });
});

describe('mutation vector: reject-unsupported-contract-major', () => {
  it('fails closed with no mutation when the contract major is unsupported', () => {
    // Capability preflight: an unknown major is rejected before any append is attempted.
    expect(supportsContractMajor('2.0.0')).toBe(false);
    expect(canMutateContractVersion('2.0.0')).toBe(false);
  });
});

describe('mutation vector: accept-supported-capability-handshake', () => {
  it('matches the declared contract range and provider interfaces', () => {
    const h = handshake();
    expect(h.contract).toBe('tallyback');
    expect(h.command_api_version).toBe(COMMAND_API_VERSION);
    expect(canMutateContractVersion(h.supported_contract_versions[0] ?? '')).toBe(true);
    for (const feature of FEATURE_INTERFACES) {
      expect(h.features).toContain(feature);
    }
    expect(SUPPORTED_CONTRACT_VERSIONS).toEqual(['1.0.0']);
  });
});
