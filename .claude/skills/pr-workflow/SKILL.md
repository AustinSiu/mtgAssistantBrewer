---
name: pr-workflow
description: The mandatory pull-request workflow for this repo. Use whenever opening, updating, or amending a PR — before any create_pull_request or update_pull_request call. Enforces checking a PR's state before editing it (create a new PR if the old one is merged/closed) and including customer-journey screenshots.
---

# PR Workflow

Every pull request for this repo must follow these steps. They are
**mandatory**, not optional — do all of them, in order, every time.

## 0. Never edit a merged or closed PR — check first

Before calling `update_pull_request` (or otherwise "editing"/"amending" a
PR), **check the PR's state**:

```
mcp__github__pull_request_read (method: "get")  →  look at `state` / `merged`
```

- If the PR is **open**: you may update it (refresh description, screenshots).
- If the PR is **merged or closed**: **do not touch it.** A merged PR is
  finished — its description must keep describing only what actually merged.
  Editing it to describe new work is wrong and misleading.

When the PR you were about to update is already merged/closed, treat the new
work as a **fresh change** and open a **new PR**:

1. `git fetch origin main`
2. Move the new commits onto the latest `main` — they are almost certainly
   stacked on already-merged history:
   - `git checkout -b <new-descriptive-branch> origin/main`
   - `git cherry-pick <commit>` (or `git rebase origin/main` from the old
     branch). The cherry-pick applies cleanly because `main` already contains
     the merged work.
3. Verify (step 2 below), push the new branch, and `create_pull_request`.

**Never stack new commits on top of already-merged history, and never
force-edit a merged PR's description.** If in doubt about whether a branch's
PR merged, check before pushing more commits to that branch.

> This repo has repeatedly hit the failure mode where follow-up work is
> committed to a branch whose PR already merged, then the merged PR's
> description is edited. The commit ends up **not in `main`**, and the merged
> PR lies about its contents. Step 0 exists to prevent exactly that.

## 1. Develop on the designated feature branch

Do the work, keeping commits focused with clear messages.

## 2. Verify before every PR (open or update)

Run and confirm green:

```
npm run lint
npx vitest run
npm run build
npm run e2e        # CHROMIUM_PATH=... for the preinstalled browser
```

Do not open or update a PR on red.

## 3. Screenshots are required

Follow the **`pr-screenshots`** skill: regenerate the customer-journey
screenshots, eyeball them, commit them on the PR branch, and embed the
relevant ones (pinned to the branch) in the PR description. Refresh them
whenever the PR's UI changes. Do not open a PR without screenshots.

Revert render-noise screenshot diffs (unchanged screens); commit only the
screenshots the change actually affected.

## 4. Commit, push, then create or update

1. Commit and push (`git push -u origin <branch>`; retry with backoff on
   network errors).
2. **Run step 0's state check.**
3. Open a PR (`create_pull_request`) if none exists for this work, or the
   prior PR is merged/closed. Update the existing PR (`update_pull_request`)
   only if it is still **open**.
4. Check for a PR template and mirror its structure if present.

## Quick checklist

- [ ] Checked the target PR's state (open vs merged/closed) — step 0
- [ ] If merged/closed → rebased onto latest `main` and opening a NEW PR
- [ ] lint / vitest / build / e2e all green
- [ ] Screenshots regenerated, eyeballed, committed, embedded (noise reverted)
- [ ] Pushed the branch; created/updated the correct (open) PR
