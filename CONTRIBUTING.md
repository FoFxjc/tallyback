# Contributing to Tallyback

Thanks for taking the time to contribute.

Tallyback is intentionally small: it models the accountability boundary around
delegated work. It does not aim to become an orchestrator, scheduler, execution
engine, autonomous merger, model router, or recursive agent-topology system.

## Before opening an issue

For a bug, please include:

- Tallyback version and Node.js version;
- operating system;
- the command or API path involved;
- a minimal reproduction when practical;
- expected behavior and actual behavior;
- sanitized diagnostics or ledger excerpts when they help.

Do not include secrets, credentials, private repository contents, or sensitive
conversation transcripts.

For a feature proposal, explain the accountability problem first. Proposals are
easier to evaluate when they show why the problem belongs in Tallyback rather
than in the host agent system, execution runtime, CI system, or Git workflow.

For security vulnerabilities, follow [SECURITY.md](SECURITY.md) instead of
opening a public issue.

## Development setup

```bash
npm ci
npm run build
npm test
```

Before submitting a pull request, run the same core checks used by CI:

```bash
npm run format:check
npm run typecheck
npm run lint
npm test
npm run build
npm run test:dist-cli
```

## Contract changes

The v1 wire-format contract under `contract/` is frozen.

Do not change v1 normative artifacts in place to add a convenience or
host-specific behavior. A proposed contract change should begin with an issue
describing the semantic need, compatibility impact, and why the existing
extension points are insufficient.

If a future contract version is intentionally changed, regenerate the manifest
and update the corresponding fixtures and conformance coverage.

## Pull requests

Prefer focused pull requests that do one thing well.

- Add or update tests for behavior changes.
- Keep documentation aligned with the implemented behavior.
- Preserve the separation between Claim, Evidence, Reconciliation, Verdict,
  Settlement, and live Git reality.
- Do not make Land mutate Git.
- Do not infer completion from agent activity alone.
- Keep host adapters thin and the core host-neutral.

If the change expands Tallyback's scope, explain the new boundary explicitly in
the pull request description.
