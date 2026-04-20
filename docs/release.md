# Release

## Preconditions

- `master` is the release branch
- local worktree is clean
- `npm run verify` passes

## Publish flow

1. Update version in `package.json`
2. Run `npm install` if the manifest changed
3. Run `npm run verify`
4. Review `npm pack --dry-run` output and confirm publish contents
5. Commit the release change
6. Tag the release
7. Push `master` and the tag
8. Publish to npm when ready
