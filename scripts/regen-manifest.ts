/**
 * Regenerate `contract/manifest.json`.
 *
 * Run from the repo root: `npm run manifest:regen`.
 *
 * The construction lives in `./manifest.ts`, which imports the single JCS implementation
 * from `src/contract` — this script cannot drift from the validator because it holds no
 * canonicalization code of its own to drift with. `test/canonicalization.test.ts` asserts
 * that the committed manifest is byte-identical to what this produces.
 */

import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { buildManifest, CONTRACT, manifestFileText } from './manifest.js';

const manifest = buildManifest();
writeFileSync(join(CONTRACT, 'manifest.json'), manifestFileText());

console.log('tree        ', manifest.tree.value);
console.log('self_digest ', manifest.self_digest.value);
for (const [name, artifact] of Object.entries(manifest.artifacts)) {
  console.log(`  ${name.padEnd(20)} ${artifact.path.padEnd(38)} ${artifact.digest.value}`);
}
