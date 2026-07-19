# Contributing to GameWeave

Thank you for helping improve GameWeave. Keep changes focused, reusable, and compatible with the package boundaries described in `docs/DESIGN.md`.

## Before opening an issue

- Search existing issues and the roadmap.
- Reduce bugs to the smallest reproducible project or code sample.
- Do not include credentials, proprietary assets, or private game source code.
- Use a private security advisory for vulnerabilities.

## Development

GameWeave requires Node.js 22.14 or newer.

```bash
npm ci
npm run typecheck
npm test
npm run build
```

Add regression tests for behavior changes. Public API changes must update `docs/API.md`; user-facing changes must update the relevant package README and `CHANGELOG.md`.

## Pull requests

- Solve one concrete problem per pull request.
- Do not mix unrelated refactors with a fix or feature.
- Preserve deterministic behavior in the simulation layer.
- Keep examples private; reusable behavior belongs in `packages/*`.
- Do not commit generated archives, installers, credentials, or npm tokens.

By contributing, you agree that your contribution is licensed under the repository's MIT License.
