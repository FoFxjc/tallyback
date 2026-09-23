# Security

## Dependency audit status (reviewed for 0.1.0)

Reviewed with `npm audit` against the dependency tree pinned by `package-lock.json`
on 2026-09-22.

- **Runtime dependency tree** (`ajv@^8.17.1`, `canonicalize@^2.0.0`, `uuid@^11.0.3`):
  `npm audit --omit=dev` → **0 advisories at any severity**. These are the three
  packages bundled into `dist/cli.js`; nothing in the runtime tree is currently
  flagged.
- **Full dependency tree** (including dev-only test tooling): **5 advisory
  entries** at the package level, all transitive through `vitest@^2.1.8` and the
  Vite toolchain it depends on. The only `fixAvailable` for every entry is
  `vitest@5.0.1`, a SemVer-major bump that the project has not accepted for
  the reasons below.

### Current advisory breakdown

| Severity | Package                     | GHSAs                                                               | Reachability                                                                                                            |
| -------- | --------------------------- | ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| critical | `vitest` (≤4.1.10)          | `GHSA-5xrq-8626-4rwp`, `GHSA-82fw-gwwq-j7x9`                        | requires `vitest --ui` server (UI advisory) or `vi.mock` with redirect resolution; neither is used by Tallyback's tests |
| high     | `vite` (≤6.4.2)             | `GHSA-4w7w-66w2-5vf9`, `GHSA-v6wh-96g9-6wx3`, `GHSA-fx2h-pf6j-xcff` | reachable only when the Vite dev server is exposed; Windows-specific for two of the three (`-v6wh`, `-fx2h`)            |
| moderate | `@vitest/mocker` (≤4.1.10)  | `GHSA-82fw-gwwq-j7x9` (same as `vitest` advisory above)             | requires `vi.mock` with redirect resolution in tests; not used by this repo's tests                                     |
| moderate | `esbuild` (≤0.24.2)         | `GHSA-67mh-4wv8-2f99`                                               | reachable only when the esbuild dev server is exposed; not used at runtime by `tallyback`                               |
| moderate | `vite-node` (≤2.2.0-beta.2) | inherits from `vite`                                                | inherits from `vite`; dev-only test runner                                                                              |

### Why not bump

- **Dev-only dependency tree.** Every flagged package is a transitive dev
  dependency of `vitest`. The published CLI (`dist/cli.js`) bundles only `ajv`,
  `canonicalize`, and `uuid` from `dependencies` — none of those is flagged.
- **CI exposure is nil.** `.github/workflows/ci.yml` runs `npm test`
  (= `vitest run`), never `vitest --ui`, and never starts a Vite dev server.
  The `validate-gate` job runs `node dist/cli.js` against an empty ledger.
- **Local exposure is bounded.** `npm test` does not bind a network port.
  Vitest's UI server (the critical-severity vector) is opt-in via `--ui` and
  is not part of any command run by the project.
- **Bumping is non-trivial.** `vitest@5` is SemVer-major. The `fixAvailable`
  it suggests may rewrite mock APIs and test-runner behavior. Upgrading solely
  to silence dev-only advisories would mix a test-runner migration into an
  otherwise unrelated change and risk regressing the 400+ test surface that
  provides the project's regression guarantee.

### Recommended actions for downstream users

- For ordinary `npm test` / `npm run build` use of Tallyback itself, the
  current dependency tree has **no materially reachable runtime exposure**.
- If you run `vitest --ui` against untrusted input, treat the dev machine as
  exposed and apply the upstream patches (bump `vitest` to a fixed version).
- If you operate in a CI environment that runs `vitest` against test fixtures
  from untrusted repositories, pin to a patched version.
- On Windows, the Vite advisory set is dev-server-exposure only; it does not
  affect Tallyback's runtime, but downstream users running `npm test` on
  Windows should still patch the dev tree for hygiene.
- Re-run `npm audit` periodically; revisit this decision when `vitest@2.x` or
  `vitest@3.x` reaches a patch version that fixes the open advisories without
  a SemVer-major bump, or when the project upgrades `vitest` for unrelated
  reasons.

## Reporting a vulnerability

Please **do not open a public issue with vulnerability details**.

If GitHub's **Report a vulnerability** option is available on the repository's
Security tab, use that private reporting channel. Otherwise, contact the
maintainer through the GitHub profile linked from
`https://github.com/FoFxjc/tallyback` and coordinate private disclosure before
publishing details.

For advisories already filed against transitive dev dependencies, the upstream
trackers are the authoritative source.
