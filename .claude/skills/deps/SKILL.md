---
name: deps
description: Triages the open Dependabot PR queue — classifies each bump, checks CI and intentional pins, merges the safe ones and reports what needs a human decision
---

# Deps Skill

Works through the open Dependabot pull requests on `fleetyards/sync`. Merges patch and minor bumps whose CI is green, and stops with a recommendation for everything else.

## When to Use

- "triage the deps", "deal with the dependabot PRs", "merge the safe dependency updates"
- Dependabot runs **weekly** here (10 npm / 5 github-actions), so the queue is small but tends to accumulate stale entries.

## Repo facts

- Ecosystems: `npm` and `github-actions` only. No `labels:` block in `.github/dependabot.yml`, so Dependabot applies its defaults: `dependencies` plus `javascript` or **`github_actions`** — note the **underscore**, unlike the hyphenated label in the main fleetyards repo.
- No update groups. Every bump is its own PR.
- This is a **WXT browser extension** — the build produces separate Chrome and Firefox artifacts, which is why there are two `Build` checks.
- **Squash or rebase** (`mergeCommitAllowed: false`). Branches are **not** deleted on merge.
- `main` is protected by the **"Main branch protection" ruleset** — the classic `branches/main/protection` API returns 404 here, which means "no *classic* protection", not "unprotected". Required checks: `Type Check & Test`, `Build (chrome)`, `Build (firefox)`. There is also a **merge queue**.

  ```bash
  gh api repos/fleetyards/sync/rulesets --jq '.[].id' | while read id; do
    gh api "repos/fleetyards/sync/rulesets/$id" \
      --jq '.rules[] | select(.type=="required_status_checks") | .parameters.required_status_checks[].context'
  done
  ```

- Auto-merge is **disabled** on this repo, so `--auto` is not available. Merge only once checks are actually green.
- PR titles are conventional commits and become the squash subject, which feeds release-please's CHANGELOG. Never rewrite the title on merge.

---

## Workflow

### 1. Pull the queue

```bash
gh pr list --repo fleetyards/sync --label dependencies --limit 50 \
  --json number,title,labels,mergeStateStatus \
  --jq '.[] | "\(.number)\t\(.mergeStateStatus)\t\(.title)"'
```

If the queue is empty, say so and stop.

### 2. Classify each PR

Parse `bump <name> from <old> to <new>` out of the title:

| Condition | Class |
|-----------|-------|
| `old.major != new.major` | **major** |
| `old.major == 0` and `old.minor != new.minor` | **major** (0.x minors are breaking) |
| `old.minor != new.minor` | minor |
| otherwise | patch |

The 0.x rule matters here — `wxt` is on `0.20.x`, so a `0.20 → 0.21` bump is a major for the build tool this extension is built with, not a minor.

GitHub Actions bumps are usually bare majors (`actions/checkout from 6 to 7`). They are still majors: read the action's release notes before merging.

### 3. Run the safety gates

A PR is **safe to merge** only if every gate passes.

#### Gate A — bump class is patch or minor

Majors go to the report for a human, even with green CI.

#### Gate B — CI is green

```bash
gh pr view <number> --repo fleetyards/sync \
  --json statusCheckRollup \
  --jq '[.statusCheckRollup[] | select(.conclusion != "SUCCESS" and .conclusion != "SKIPPED" and .conclusion != "NEUTRAL")] | map("\(.name): \(.conclusion // .status)") | .[]'
```

Empty output means green. A `PENDING` check means come back later — auto-merge is off here, so there is no way to queue it up in advance.

`Type Check & Test` is the check that catches the toolchain breakages that matter in this repo (see Gate C).

#### Gate C — no intentional pin or known incompatibility

For **npm** PRs a `package.json` change is expected on every bump and is not a signal by itself. Look for an **exact** version (no `^`/`~`) of the package being bumped — an exact pin is usually deliberate.

Check `git log` for a prior manual pin or revert, the strongest evidence a bump has been rejected before:

```bash
git log --oneline -5 --grep="<package-name>"
```

**Known incompatibility — `typescript` majors.** TypeScript 7 moved the compiler into a native binary and reduced the `typescript` main export to a version string, so `vue-tsc` (and every other tool that patches the in-process JS compiler) cannot run on it. This repo uses `vue-tsc`, so a TS 7 bump fails `Type Check & Test`. The sibling `reckoning/reckoning` repo encodes this as a permanent `ignore` block in its `dependabot.yml`:

```yaml
    ignore:
      - dependency-name: "typescript"
        update-types: ["version-update:semver-major"]
```

This repo does **not** have that block yet, so the PR is reopened every week. When a typescript major shows up, hold it and mention that adding the ignore would close it for good — but do not edit `dependabot.yml` without the user asking.

#### Gate D — mergeable state

`BEHIND` means the PR needs a rebase. Ask Dependabot and re-check next run rather than blocking:

```bash
gh pr comment <number> --repo fleetyards/sync --body "@dependabot rebase"
```

`DIRTY` (conflicting) is best fixed with `@dependabot recreate`. `UNKNOWN` means GitHub is still computing mergeability — re-poll. `BLOCKED` means a required check has not passed; check which one before assuming it is stale.

Long-open PRs are worth a look — a bump that has sat for months (`#98`, `#104` at the time of writing) is usually blocked on something real, not forgotten.

### 4. Merge the safe ones

```bash
gh pr merge <number> --repo fleetyards/sync --squash
```

Because `main` has a merge queue, this enqueues the PR rather than merging it on the spot. Confirm it landed rather than assuming.

Branches are not auto-deleted here, so tidy up after a successful merge if the user wants:

```bash
gh api -X DELETE repos/fleetyards/sync/git/refs/heads/<headRefName>
```

Merge one at a time and post `@dependabot rebase` on whatever is left `BEHIND` at the end.

### 5. Report

Group by outcome:

```
Merged / enqueued (N)
  #139  patch  js       vitest 4.1.4 → 4.1.10

Held — needs a decision (N)
  #140  major  js       typescript 6.0.3 → 7.0.2
        Type Check & Test fails — TS7's native compiler breaks vue-tsc.
        Permanent fix is a dependabot ignore for typescript majors.
  #134  major  actions  actions/checkout 6 → 7

Rebasing (N)
Red CI (N)
```

For each held major, say *why* in one line and what would unblock it — read the release notes in the PR body (`gh pr view <n> --json body`) so the reason is concrete rather than "it's a major".

Do not merge anything in the held list without the user saying so.

---

## Error Handling

- **`gh` not authenticated** → tell the user to run `gh auth login` and stop.
- **Merge rejected** → report the error, leave the PR open, continue with the rest of the queue.
- **Most of the queue still running CI** → merge what is green, list the pending ones, suggest re-running later.
- **Both `Build` checks fail but `Type Check & Test` passes** → likely a WXT/bundler incompatibility rather than a type error; read the build log before deciding.
