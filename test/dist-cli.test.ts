/**
 * Built-CLI distribution tests (depends on `dist/cli.js` existing).
 *
 * Originally filed as `codex-regressions-3.test.ts` finding 5 — *"the published CLI
 * (`dist/cli.js`) carries a `#!/usr/bin/env node` shebang and is marked executable after
 * `npm run build`, so `tallyback` / `npx tallyback` actually run on POSIX systems"*. Moved
 * here so a clean checkout (no `dist/`) can still pass `npm test`; this file is only run
 * after `npm run build` (see `.github/workflows/ci.yml`).
 *
 * Three guarantees this file pins:
 *   1. `dist/cli.js` line 1 is the Node shebang.
 *   2. `dist/cli.js` has the executable bit set after `postbuild`.
 *   3. `dist/cli.js` runs directly as an executable (not only via `node dist/cli.js`).
 */

import { execFile } from 'node:child_process';
import { readFile, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { describe, expect, it } from 'vitest';

const execFileAsync = promisify(execFile);
const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const DIST_CLI = join(ROOT, 'dist', 'cli.js');

describe('built CLI is directly executable on POSIX', () => {
  it('carries a Node shebang as the first line of dist/cli.js', async () => {
    const firstLine = (await readFile(DIST_CLI, 'utf8')).split('\n')[0];
    expect(firstLine).toBe('#!/usr/bin/env node');
  });

  it('is marked executable after a build', async () => {
    const info = await stat(DIST_CLI);
    expect(info.mode & 0o111).not.toBe(0);
  });

  it('runs directly as an executable, not only via `node dist/cli.js`', async () => {
    const { stdout } = await execFileAsync(DIST_CLI, ['handshake']);
    const handshake = JSON.parse(stdout) as { implementation_version: string };
    expect(handshake.implementation_version).toBeTruthy();
  });
});
