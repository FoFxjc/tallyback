/**
 * Lead-owned capability handshake constants and version-range logic.
 *
 * The handshake is the deterministic public interface required by SPEC §16: every
 * mutating workflow performs this preflight, and an unknown contract major fails closed.
 */

export const IMPLEMENTATION_VERSION = '0.1.0';
export const COMMAND_API_VERSION = '1';
export const CONTRACT_NAME = 'tallyback';

/**
 * Contract versions this implementation can mutate against. Reads additionally require
 * the implementation to declare parser support for a specific major (see
 * `supportsContractMajor`).
 */
export const SUPPORTED_CONTRACT_VERSIONS = ['1.0.0'];

/** Stable feature / provider-interface identifiers exposed by this implementation. */
export const FEATURE_INTERFACES = ['store', 'check', 'migration', 'land', 'view', 'watch'] as const;

export interface CapabilityHandshake {
  contract: string;
  implementation_version: string;
  command_api_version: string;
  supported_contract_versions: string[];
  features: string[];
}

export function handshake(): CapabilityHandshake {
  return {
    contract: CONTRACT_NAME,
    implementation_version: IMPLEMENTATION_VERSION,
    command_api_version: COMMAND_API_VERSION,
    supported_contract_versions: [...SUPPORTED_CONTRACT_VERSIONS],
    features: [...FEATURE_INTERFACES],
  };
}

function majorOf(version: string): number {
  const match = /^(\d+)(?:\.\d+){0,2}$/.exec(version.trim());
  if (!match) return Number.NaN;
  return Number(match[1]);
}

/**
 * Whether the implementation can parse/read a snapshot produced under `version`.
 * Unknown contract majors fail closed; a known major with an unrecognized minor is a
 * parser-capability question (v1 declares support for the 1.0.0 contract only).
 */
export function supportsContractMajor(version: string): boolean {
  const major = majorOf(version);
  if (Number.isNaN(major)) return false;
  return SUPPORTED_CONTRACT_VERSIONS.some((v) => majorOf(v) === major);
}

/**
 * Whether a mutating workflow may proceed against `version`. Requires an exact match to a
 * supported contract version — a read-only major match is NOT sufficient to mutate.
 */
export function canMutateContractVersion(version: string): boolean {
  return SUPPORTED_CONTRACT_VERSIONS.includes(version.trim());
}
