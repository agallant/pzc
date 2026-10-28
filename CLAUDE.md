# CLAUDE.md

A client-only TypeScript progressive web app for phones and tablets, deployed to GitHub Pages.
There is no backend: everything runs in the browser, and anything persistent lives on the device
(IndexedDB, localStorage, Cache Storage) or in files the user exports.

The app's own description, stack and structure belong in `README.md`. This file covers how work
gets done here. Keep it current when something below stops being true.

## Bootstrapping a new repo

If `README.md` starts with a `TEMPLATE-README` comment, this repo was just created from the
template and has no app yet. The first PR should:

1. **Choose the stack** for what the app needs and say why in the PR description. The only fixed
   choices are TypeScript and a static build that GitHub Pages can serve. Vite is a sensible
   default for most apps, games included; pick something else when there's a concrete reason.
2. **Scaffold the app** so it meets the CI contract below, including a web app manifest, icons and
   a service worker, with a minimal first screen that works on a phone.
3. **Rewrite `README.md`** as the app's README: what it is, the live URL
   (`https://<owner>.github.io/<repo>/`), how to install it to the home screen, how to run and
   test it locally, and the stack. Link to `.github/setup/README.md` for the PR and deploy
   pipeline instead of repeating it. Remove the `TEMPLATE-README` comment.
4. **Uncomment the dependency block** in `.github/dependabot.yaml` (`npm` also covers pnpm and
   Yarn; use `bun` for Bun).

If anything about the app itself is unclear (what it does, who it's for, the main screens), ask
before scaffolding rather than guessing.

## Creating a new app repo

When asked to start a new app, create its repo through the **Repo setup** workflow in the
template repo, `agallant/claude-coderabbit-pwa-template` (also linked from
`.github/setup/README.md`). Cloud sessions can't change repo settings themselves, and the user
shouldn't have to run anything locally.

1. Settle the repo name: short, lowercase, hyphenated. If the user didn't give one, propose one
   and confirm it before creating anything.
2. Open an issue in the template repo titled `Set up <owner>/<name>`. Make the body's first line a
   one-line description of the app. Add a line `visibility: private` only if the user asked for a
   private repo.
   Use the REST API: `gh issue` commands go through GraphQL, which cloud sessions can't reach.
   `gh api -X POST repos/agallant/claude-coderabbit-pwa-template/issues -f title="Set up <owner>/<name>" -f body="<description>"`
3. Wait for the workflow's comment on the issue, usually within a minute
   (`gh api repos/agallant/claude-coderabbit-pwa-template/issues/<number>/comments --jq '.[].body'`).
   A successful run closes the issue. If it failed, pass on the error. A missing or expired
   `SETUP_TOKEN` is the usual cause, and the guide explains the fix.
4. Ask the user to add the new repo to the Claude GitHub App
   (github.com/settings/installations → Claude → Configure → Repository access), the one step
   GitHub only allows in a browser. Once they confirm, attach the repo and bootstrap it as above.

Never ask the user for a token or to paste credentials; the workflow holds the only one.

## How changes land

- Work on a branch and open a PR into `main`. Pushing to `main` directly is blocked.
- Non-draft PRs get auto-merge turned on as soon as they open. A PR merges by itself once every
  required check passes, CodeRabbit approves, and all review threads are resolved. So open a PR
  only when the work is ready to ship, or open it as a draft.
- Keep PRs small enough to review in one pass; CodeRabbit skips very large ones.
- After opening a PR, follow it to the end: wait for the checks and CodeRabbit's review, fix
  what's failing, and handle every review comment by either fixing it or replying with the
  reason it shouldn't change. Then resolve the thread. Unresolved threads block the merge.
- Never ask CodeRabbit to approve or resolve (`@coderabbitai approve`, `@coderabbitai resolve`),
  dismiss its reviews, or mark a PR `manual-merge` to dodge a gate.
- Don't weaken a gate to get a PR through: the workflows in `.github/`, `.github/setup/ruleset-main.json`,
  `.github/lighthouserc.json` and `.coderabbit.yaml`. If one is genuinely wrong, change it in its
  own PR that says so in the title, and only when the user has asked for or agreed to it.
- PR descriptions say what changed for the person using the app and how to try it on the preview
  (the preview bot comments the link and a QR code).

## CI contract

CI runs `package.json` scripts by name with the package manager implied by the lockfile
(`bun.lock`, `pnpm-lock.yaml`, `yarn.lock`, else npm). Commit the lockfile.

| Script | Required | Notes |
| --- | --- | --- |
| `build` | yes | Writes the static site to `dist/` (or the folder in the `BUILD_DIR` repo variable) |
| `typecheck` | if no `tsconfig.json` | Without it, CI runs `tsc --noEmit` against `tsconfig.json` |
| `lint` | no | Run when present |
| `test` | no | Run when present; tests must not need a display or network |

The build output must contain `index.html` with a `<link rel="manifest">` that points to a
manifest file in the build.

The build receives these environment variables:

- `BASE_PATH`: the absolute path the site is served from, with slashes at both ends:
  `/<repo>/` for `main`, `/<repo>/pr-preview/pr-<N>/` for a PR preview, `/` for a custom
  domain. A relative asset base (`./`) works at both URLs without it, but the manifest's
  `start_url` and `scope`, the service worker scope and any client-side router need the
  absolute path. Fall back to `/` when it's unset (local dev).
- `BUILD_SHA` and `BUILD_LABEL` (`main`, `PR #<N>` or `ci`): show them somewhere unobtrusive,
  like a settings or about screen, so it's obvious which build a device is running.

Run the same scripts locally before pushing; a red CI run costs a review round.

## PWA and mobile requirements

- **Installable**: manifest with `name`, `short_name`, `start_url` and `scope` (both from
  `BASE_PATH`), `display: standalone` (or `fullscreen` for a game), theme and background colors,
  and 192px, 512px and 512px maskable PNG icons. Also an `apple-touch-icon`.
- **Offline**: a service worker precaches the app shell, so the app opens with no network after
  the first visit. Updates must not strand users on an old version: activate new workers promptly
  or offer a reload.
- **Previews share the origin.** The live site's service worker controls `/<repo>/` and therefore
  `/<repo>/pr-preview/…` too. Exclude `pr-preview/` from its navigation fallback and runtime
  caching (for Workbox: `navigateFallbackDenylist: [/\/pr-preview\//]`), or previews show the live
  app.
- **Touch first**: pointer events, tap targets of at least 44×44 px, no hover-only interactions,
  `touch-action` set where gestures matter, no accidental double-tap zoom or text selection on
  game surfaces.
- **Every screen size**: works from a 360px-wide phone to a 13" tablet, portrait and landscape.
  Respect safe-area insets (`viewport-fit=cover` plus `env(safe-area-inset-*)`). Use `dvh`/`svh`
  rather than `100vh`.
- **iOS Safari** is the strictest target: test there (or reason carefully about it) before using
  a newer web API, and keep a fallback. Audio needs a user gesture to start, and Safari can evict
  storage for sites not added to the home screen, so offer an export for anything users would
  hate to lose.
- **Accessible**: real buttons and labels, visible focus, sufficient contrast, and
  `prefers-reduced-motion` honored. Lighthouse fails the PR below 90 on accessibility.
- **Light**: keep the initial download small and avoid blocking the main thread.

### Real-time games

- Drive the loop with `requestAnimationFrame` and a fixed-timestep update, decoupled from the
  frame rate (devices run at 60, 90 or 120 Hz).
- Size the canvas by `devicePixelRatio`, capped where fill rate hurts, and handle resize and
  rotation.
- Avoid per-frame allocation in hot paths to keep GC pauses out of gameplay.
- Pause on `visibilitychange`; resume `AudioContext` from a user gesture.
- Keep game logic pure and separate from rendering and input so it can be unit-tested headless.
