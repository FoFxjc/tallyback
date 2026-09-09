/**
 * Check boundary — public exports.
 *
 * Owns repository/workspace resolution, Git reconciliation, CheckInvocation /
 * CheckResult production, the Store↔Check ingestion flow, and legacy migration.
 */

export * from './ids.js';
export * from './types.js';
export * from './resolution.js';
export * from './reconcile.js';
export * from './invocation.js';
export * from './flow.js';
export * from './migration.js';
export * from './migration-workflow.js';
