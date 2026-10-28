# Repository setup and merge gates

This repo came from [claude-coderabbit-pwa-template](https://github.com/agallant/claude-coderabbit-pwa-template).
Claude opens PRs; CodeRabbit, CodeQL and CI review them; a PR merges by itself once every gate
passes; `main` deploys to GitHub Pages. This page explains the setup and how each part works.
It stays accurate for the life of the repo, so the root README doesn't need to repeat it.

## Setting up repos

A template copies files only. Repo settings, rulesets and GitHub App access don't come along, so
every new repo needs configuring. The **Repo setup** workflow
([`repo-setup.yaml`](../workflows/repo-setup.yaml)), running in the template repo, does that: it
creates the repo from the template and runs [`setup-repo.sh`](setup-repo.sh) on it. It needs a
token you create once. Claude can't apply these settings from a cloud session itself, since
those sessions aren't allowed to change repo settings, rulesets or Pages.

### Once, in the template repo (about five minutes)

1. **Mark it as a template**: *Settings → General → Template repository*.
2. **Create the setup token**. This
   [prefilled link](https://github.com/settings/personal-access-tokens/new?name=Repo+setup+%28PWA+template%29&description=Used+only+by+the+Repo+setup+workflow+in+the+PWA+template+repo,+to+create+and+configure+app+repos.&expires_in=365&administration=write&contents=write&issues=write&pages=write&actions_variables=write&repository_creation=write)
   fills in the name, an expiry a year out and the permissions. Under *Repository access*, choose
   **All repositories** (the repos it will set up don't exist yet), then **Generate token** and
   copy it.
   - The permissions, if you'd rather fill the form in by hand: Administration, Contents, Issues,
     Pages, Variables and Repository creation, each *Read and write*.
3. **Store the token**: template repo → *Settings → Environments → New environment* named
   `repo-setup`. Under *Deployment branches and tags*, choose **Selected branches and tags** and
   add `main`. Then *Add environment secret*: name `SETUP_TOKEN`, value the token.
4. **Install the apps.**
   - [CodeRabbit](https://github.com/apps/coderabbitai): choose **All repositories** so new repos
     are covered automatically. It reads code and comments on PRs, so broad access is a
     reasonable trade.
   - [Claude](https://github.com/apps/claude): keep **Only select repositories** and include the
     template repo. You'll add each new app repo here (see below).
5. **Optional: gate the template too.** Open an issue in the template repo titled
   `Set up agallant/claude-coderabbit-pwa-template`. That applies the same ruleset, so changes to
   the template (and to the workflow that holds the token) also need CodeRabbit's approval.

### For each new app

1. **Ask Claude** (in a session with the template repo) to start a new app, for example
   *"Create agallant/space-dodge: a one-thumb arcade game for phones"*. Claude opens an issue in
   the template repo titled `Set up agallant/space-dodge` with the description as its body. The
   workflow creates the repo, applies the settings, comments the result and closes the issue.
   - Without Claude: open that issue yourself (add a line `visibility: private` for a private
     repo), or run *Actions → Repo setup → Run workflow*.
   - Public is the default and the simplest choice. CodeQL, secret scanning, dependency review
     and Pages are free only on public repos.
2. **Add the repo to the Claude app**, the one step GitHub only allows in a browser:
   [github.com/settings/installations](https://github.com/settings/installations) → **Claude** →
   **Configure** → *Repository access* → add the repo → **Save**.
3. **Start building**: open a session on the new repo at [claude.ai/code](https://claude.ai/code)
   and describe the app. `CLAUDE.md` tells Claude how to bootstrap it.

Re-running setup on an existing repo is safe. Open another `Set up owner/name` issue after
changing the ruleset or the script, and the settings are re-applied.

### What the token can do, and why it's contained

The token can administer every repo you own. It's kept narrow in practice:

- It's stored only in the template repo's `repo-setup` environment, which only workflow runs
  from `main` can use. A workflow edited on a PR branch can't read it.
- The workflow runs only for issues opened by an admin of the template repo (you, or Claude
  acting as you), and it only runs `setup-repo.sh`.
- Claude never sees the token. It can only ask for the fixed setup to run.
- Step 5 above makes changing that workflow go through a reviewed PR as well.

When the token expires, the next setup run fails with a message pointing here. Create a new one
with the same link and replace the secret.

### Without the token

Run the script yourself with the [GitHub CLI](https://cli.github.com) logged in as an admin, plus
[jq](https://jqlang.org/download/):

```sh
.github/setup/setup-repo.sh owner/name
```

With no local toolchain, use a Codespace: on the repo, *Code → Codespaces → Create codespace*,
then run `unset GITHUB_TOKEN; gh auth login --web` (the Codespace's built-in token can't change
settings) and the command above. You'll still need to create the repo (*Use this template*) and
add it to the apps by hand.

## How a PR gets merged

```
Claude pushes a branch and opens a PR
  ├─ Auto-merge workflow ─── enables GitHub auto-merge (squash)
  ├─ CI ─────────────────── typecheck, lint, test, build, build-output check
  ├─ CodeQL ─────────────── code scanning of the app (JS/TS) and of the workflows
  ├─ zizmor ─────────────── security audit of the workflows
  ├─ Dependency review ──── blocks newly added vulnerable dependencies
  ├─ PR preview ─────────── deploys to …/pr-preview/pr-N/, comments link + QR code
  │    └─ Lighthouse ────── mobile audit of the live preview
  └─ CodeRabbit ─────────── reviews; requests changes or approves
       Claude fixes or answers each comment and resolves the threads; CodeRabbit re-reviews
All required checks green + CodeRabbit approval + no open threads → squash-merge → deploy
```

The `main` ruleset ([`ruleset-main.json`](ruleset-main.json)) requires:

| Gate | What blocks a merge |
| --- | --- |
| Pull request | 1 approving review (CodeRabbit is the only reviewer who isn't the author), all review threads resolved, squash merges only |
| `CI` | Any failing script, a missing `build` script, no `index.html`, or no linked web app manifest |
| `Analyze (javascript-typescript)`, `Analyze (actions)` | The analysis failing to run |
| Code scanning results | A new CodeQL alert of high/critical security severity or error level, or a zizmor alert of medium+ severity |
| `zizmor` | The audit failing to run (or any finding, when `CODE_SCANNING=off`) |
| `Dependency review` | A PR that adds a dependency with a known high/critical vulnerability |
| `Lighthouse` | Accessibility or best-practices score under 90 on mobile, or a preview that failed to deploy (performance is reported, not gated) |

Required checks must come from GitHub Actions (the ruleset pins them to its app ID), so a status
posted by anyone else can't satisfy them. Nobody is on the bypass list, including admins acting
through Claude. To merge something by hand, edit the ruleset in *Settings → Rules*, or add an
admin bypass there.

**Why CodeRabbit's approval rather than its status check:** CodeRabbit's
`auto_approvals` mode (in `.coderabbit.yaml`) requests changes when it has blocking findings and
approves once they're resolved. Requiring an approval fails closed: if CodeRabbit is not
installed, rate-limited or skipped the PR, nothing approves and nothing merges. PR authors can't
self-approve with `@coderabbitai approve` (`allow_author_approval: false`), which matters because
Claude's comments are posted as you.

## Repository variables

Optional, under *Settings → Secrets and variables → Actions → Variables*:

| Variable | Default | Use |
| --- | --- | --- |
| `BUILD_DIR` | `dist` | Folder the `build` script writes the site to |
| `SITE_BASE_PATH` | `/<repo>/` | Path the site is served from. Set to `/` for a custom domain |
| `AUTOMERGE` | on | `off` stops PRs from merging by themselves |
| `CODE_SCANNING` | on | `off` skips CodeQL, Dependency review and zizmor's upload; the setup script sets it on private repos without Code Security |

## Holding a PR back

Open it as a draft, add the `manual-merge` label before opening it, or run
`gh pr merge --disable-auto <number>`.

## Deploys and previews

- `deploy.yaml` builds `main` into the root of the `gh-pages` branch on every push to `main`. An
  hourly run catches merges that didn't trigger a push event and exits early if `main` is already
  live. GitHub Pages can cache pages for up to 10 minutes.
- `preview.yaml` builds each PR into `gh-pages:/pr-preview/pr-N/`, comments the URL and a QR code
  for opening it on a phone, runs Lighthouse against it, and deletes it when the PR closes. Fork
  PRs get no preview, since their token can't write.
- The build gets `BASE_PATH` (`/<repo>/` or `/<repo>/pr-preview/pr-N/`), `BUILD_SHA` and
  `BUILD_LABEL` (`main`, `PR #N`, or `ci`) as environment variables.

## Keeping the template's files up to date

Dependabot updates the SHA-pinned actions weekly (after a 7-day cooldown) as ordinary PRs that go
through the same gates. To pull later improvements from the template, compare the files in
`.github/`, `CLAUDE.md` and `.coderabbit.yaml` with the template repo.
