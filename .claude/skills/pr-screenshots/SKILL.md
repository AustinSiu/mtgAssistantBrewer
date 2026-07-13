---
name: pr-screenshots
description: Capture customer-journey screenshots and embed them in the pull request description. Use every time a pull request for this repo is opened, and refresh the screenshots whenever a PR's UI-affecting changes are updated.
---

# PR Screenshots

Every pull request description in this repo must include screenshots of the
customer journey so the change can be reviewed visually before merge. Do not
open a PR without them, and refresh them when new commits change the UI.

## Steps

1. **Build and capture.** Run the e2e journey against the production build:

   ```
   npm run build
   npm run e2e
   ```

   This writes the journey screenshots to `docs/screenshots/`. (On a machine
   with a pre-installed Chromium, set `CHROMIUM_PATH=/path/to/chromium`
   instead of running `npx playwright install chromium`. Scryfall responses
   are stubbed by default; set `SCRYFALL_LIVE=1` to exercise the real API.)

2. **Eyeball every image before using it.** Open each PNG and confirm it
   shows what its filename claims — a screenshot of the wrong state is worse
   than none. If the change adds UI the journey doesn't cover, extend
   `e2e/journey.spec.js` to visit it and capture it.

3. **Commit the screenshots to the PR branch.** GitHub can only render
   images that are reachable, so `docs/screenshots/*.png` must be committed
   and pushed on the same branch as the PR.

4. **Embed them in the PR description** with raw URLs pinned to the branch:

   ```markdown
   ## Screenshots

   | Step | Screenshot |
   | --- | --- |
   | Landing | ![landing](https://raw.githubusercontent.com/AustinSiu/mtgAssistantBrewer/<branch-name>/docs/screenshots/01-landing.png) |
   ```

   Include at minimum: the entry point of the changed flow, the changed UI
   itself, and any error/edge state the change touches. Skip steps that are
   irrelevant to the diff rather than padding the description.

5. **State how the data was produced** — one line in the description saying
   whether Scryfall responses were stubbed or live, so reviewers know what
   they are looking at.
