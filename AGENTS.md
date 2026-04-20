# Agent Notes

- Keep this repo Node-first. Prefer `npm` over introducing extra tooling.
- Preserve the public Homebridge plugin surface. Avoid repo-local process sprawl.
- Before changing published package contents, verify with `npm pack --dry-run`.
- Keep the README user-facing. Put implementation-only guidance here, not in the README.
- Run `npm test` for behavior changes. Run `npm run verify` before release-oriented changes.
