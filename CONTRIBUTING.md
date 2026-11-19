# Contributing

Work on a feature branch off `main`. Open a PR; squash-merge when CI is green.

- Python ≥ 3.11. Package code is `src/cli` (imported as `stackshot`); tests in `tests/`.
- `uv sync --group dev` then `uv run pytest`. Tests should stay fast and real — no mocks of the package, no subprocess shell-outs for what can be called in-process.
- Web app: `cd src/web && npm ci && npm run build` (`tsc` + Vite).
- User-visible changes bump `[project].version` in `pyproject.toml` (semver) and add a `CHANGELOG.md` section. Pure docs/CI/refactors do not bump.
- Release binaries are built on push to `main` when the version is new. See `CLAUDE.md` for the tag/release flow.

Please don't commit `.idea/`, `node_modules/`, or `src/web/dist/`.
