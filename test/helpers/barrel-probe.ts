/**
 * Loads the package barrel in a transpile-only runtime and reports what it exports.
 *
 * Run as a subprocess by `test/review-regressions.test.ts`. It has to be a separate
 * process: the failure mode it guards against (a type re-exported with `export {}` instead
 * of `export type {}`) is a module *load* error, which a same-process dynamic import inside
 * Vitest would surface differently — and which `tsc --noEmit` does not catch at all,
 * because tsc erases the re-export when it emits.
 */

import * as barrel from '../../src/index.js';

process.stdout.write(
  JSON.stringify({
    exports: Object.keys(barrel).length,
    hasStore: typeof barrel.Store === 'function',
    hasValidateSnapshot: typeof barrel.validate_snapshot === 'function',
  }) + '\n',
);
