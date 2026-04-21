# Agent Notes

- Keep this repo Node-first. Prefer `npm` over introducing extra tooling.
- Preserve the public Homebridge plugin surface. Avoid repo-local process sprawl.
- Keep `README.md` user-facing and move durable config detail into `docs/contracts.md`.
- Before changing published package contents, verify with `npm pack --dry-run`.
- Run `npm test` for behavior changes. Run `npm run verify` before release-oriented changes.
