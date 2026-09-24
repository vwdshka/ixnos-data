# Contributing to ixnos-data

Thank you for helping. Issues, data reports and pull requests are all welcome, in Greek or
English.

## Ways to help

- **Report wrong or missing data** with the "Data issue" template: a record that looks wrong,
  a tender ixnos-data missed, a badly labelled organisation.
- **Report bugs or suggest features** with the other issue templates.
- **Improve Greek search:** new cases for `contracts/text-normalisation/cases.json` or
  `contracts/search-quality/queries.json` are some of the most useful contributions.
- **Pick up an issue** labelled `good first issue`.

## Development setup

See [Running it locally](README.md#running-it-locally). You need Docker, .NET 10, Python 3.12
with uv, and Node.js 24 with pnpm.

## Making a change

1. Branch from `main`: `feat/...`, `fix/...` or `docs/...`.
2. Keep the change focused; one concern per pull request.
3. Add or update tests. Anything that touches Greek text needs test cases.
4. Run the checks for the parts you changed:
   - Backend: `dotnet format backend/IxnosData.slnx --verify-no-changes` and `dotnet test backend/IxnosData.slnx`
   - Pipeline: `uv run ruff check .`, `uv run ruff format --check .`, `uv run mypy src tests`, `uv run pytest` (in `pipeline/`)
   - Web: `pnpm lint`, `pnpm typecheck`, `pnpm build` (in `web/`)
5. If you changed API endpoints or EF migrations, run `./scripts/generate-contracts.sh` and
   commit the result. CI fails otherwise.
6. Write commit messages as [Conventional Commits](https://www.conventionalcommits.org/),
   scoped by area: `feat(pipeline): ...`, `fix(web): ...`, `docs: ...`.
7. Open a pull request and fill in the template.

## Ground rules

- **The schema changes only through EF Core migrations** in `backend/`. The pipeline mirrors
  tables in `pipeline/src/ixnos_data_pipeline/db/tables.py` and never alters them.
- **Be gentle with the source APIs.** Keep the rate limits in the source clients, and cache
  raw pages when developing (`IXNOS_DATA_RAW_CACHE_DIR`).
- **No personal data in fixtures.** Trimmed real responses are welcome as test fixtures, but
  replace people's names and VAT numbers with placeholders first.
- **Significant decisions get an ADR** in `docs/adr/` (template: `0000-template.md`).

## Code of conduct

By taking part you agree to the [code of conduct](CODE_OF_CONDUCT.md).
