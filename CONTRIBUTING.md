# Contributing to ComForce Connect

Branch from `integration`. Open feature PRs against `integration`. Andrew promotes tested changes from `integration` to `main`.

## Start a feature

From the repo root with a clean working tree, run:

```sh
git fetch origin
git switch integration
git pull --ff-only origin integration
git switch -c feature/request-intake
```

Replace `feature/request-intake` with a name describing your change. Keep each PR focused on one behavior a teammate can verify. Follow [the local guide](docs/LOCAL_DEVELOPMENT.md) to run the app. Commit schema changes as new migrations, and include the lockfile if dependencies change. Use fictional data. Keep local environment files and credentials out of commits.

For hand-authored code, keep a short purpose, contributor, and AI-assistance header. Identify the actual model when known and the work it performed. Give people credit for their actual contributions. For formats without comments, use the README attribution exception list. Leave generated files alone.

## Open the PR

Run the relevant checks in the local guide. For an intake change, review the working tree, then stage the intended files by name.

```sh
git status --short
git diff
git add -- src/intake/Intake.tsx src/intake/form.ts tests/intake.test.mjs
git diff --cached
git commit -m "Add multi-need request intake"
git push -u origin HEAD
gh pr create --base integration --head feature/request-intake --title "Add multi-need request intake" --body "Adds multi-service requests. Tested with npm test and npm run build."
```

Replace the example paths, branch, change description and checks with your own. In the GitHub web interface, choose **base** `integration` and **compare** `feature/request-intake`. Say what changed and how you tested it.

If your branch falls behind, commit or otherwise preserve local edits, then run `git fetch origin` and `git merge origin/integration` on your feature branch. Resolve conflicts, repeat the affected checks, and push. Andrew opens and merges the release PR from `integration` to `main` after the demo passes.
