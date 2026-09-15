# Security

## Dependency audit status

`npm audit` on the current dependency tree reports several transitive vulnerabilities
through the `vitest` dev toolchain (none of the runtime dependencies is flagged). The
fixAvailable for every entry is `vitest@5.0.0`, a SemVer-major bump with no patch
release within the current `vitest@^2.1.8` range. This slice chooses to **document
rather than bump** for the reasons below.

### Reported advisories (dev-only, via vitest)

| Package                                                                      | Severity        | Reachability                                                                                       |
| ---------------------------------------------------------------------------- | --------------- | -------------------------------------------------------------------------------------------------- |
| `vitest` — _UI server arbitrary file read / execute_ (`GHSA-5xrq-8626-4rwp`) | critical        | requires `vitest --ui`; never run in CI or local `npm test`                                        |
| `vitest` — _path traversal via `@vitest/mocker`_ (`GHSA-82fw-gwwq-j7x9`)     | moderate        | requires `vi.mock` with redirect resolution in tests; not used by this repo's test suite           |
| `vite` — _path traversal in optimized deps_ (`GHSA-4w7w-66w2-5vf9`)          | moderate        | reachable only when the Vite dev server is exposed; `npm test` uses `vitest run`, not a dev server |
| `vite` — _NTLMv2 hash disclosure via UNC paths_ (`GHSA-v6wh-96g9-6wx3`)      | moderate        | Windows-specific UNC handling; project ships POSIX-first                                           |
| `vite` — _`server.fs.deny` bypass on Windows_ (`GHSA-fx2h-pf6j-xcff`)        | high (CVSS 7.5) | reachable only on Windows when the Vite dev server is exposed                                      |
| `esbuild` — _dev server proxy request forgery_ (`GHSA-67mh-4wv8-2f99`)       | moderate        | reachable only when the dev server is exposed                                                      |
| `vite-node`                                                                  | moderate        | inherits from `vite`                                                                               |

### Why not bump

- **Dev-only dependency tree.** Every flagged package is a transitive dev dependency of
  `vitest`. The published CLI (`dist/cli.js`) bundles only `ajv`, `canonicalize`, and
  `uuid` from `dependencies` — none of those is flagged.
- **CI exposure is nil.** `.github/workflows/ci.yml` runs `npm test` (= `vitest run`), no
  `--ui`, no dev server. The validate-gate job runs `node dist/cli.js` against an empty
  ledger.
- **Local exposure is bounded.** `npm test` does not bind a network port. Vitest's UI
  server (the critical-severity vector) is opt-in via `--ui` and is not part of any
  command run by the project.
- **Bumping is non-trivial.** `vitest@5` is SemVer-major. The `fixAvailable` it suggests
  may rewrite mock APIs and test runner behavior; accepting it inside a stabilization
  slice would mix two unrelated changes and risk regressing the 400+ test surface that
  is the core regression guarantee.

### Recommended actions for downstream users

- If you run `vitest --ui` against untrusted input, treat the dev machine as exposed and
  apply the upstream patches (bump `vitest` to a fixed version).
- If you operate in a CI environment that runs `vitest` against test fixtures from
  untrusted repositories, pin to a patched version.
- For ordinary `npm test` / `npm run build` use of Tallyback itself, the current
  dependency tree has no materially reachable runtime exposure.
- Re-run `npm audit` periodically; revisit this decision when `vitest@2.x` or
  `vitest@3.x` reaches a patch version that fixes the open advisories without a
  SemVer-major bump, or when the project upgrades `vitest` for unrelated reasons.
