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

Run the relevant checks in the local guide. Stage the files you intended to change, then:

```sh
git diff --cached
git commit -m "Add multi-need request intake"
git push -u origin HEAD
```

In GitHub choose **base: integration** and **compare: your feature branch**. Say what changed and how you tested it. For a UI change, attach a screenshot when it helps review. For a database change, describe the migration. Check the base again before submitting.

If your branch falls behind, commit or otherwise preserve local edits, then run `git fetch origin` and `git merge origin/integration` on your feature branch. Resolve conflicts, repeat the affected checks, and push. Andrew opens and merges the release PR from `integration` to `main` after the demo passes.
