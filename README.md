<!--
TEMPLATE-README: this file still describes the template, not an app.
Claude: in the first PR that adds the app, replace this whole file with a README for the app
(see "Bootstrapping a new repo" in CLAUDE.md), and delete this comment.
-->

# Claude + CodeRabbit PWA template

A GitHub template for TypeScript progressive web apps aimed at phones and tablets, built by
Claude, reviewed by CodeRabbit, and deployed to GitHub Pages. No backend.

Claude opens every change as a pull request. CI, CodeQL, zizmor, Dependency review, a Lighthouse
mobile audit of a live preview, and CodeRabbit's review all have to pass, and then the PR merges
by itself and `main` deploys.

The template commits to **TypeScript** and **GitHub Pages**, nothing else: no framework, bundler,
test runner or package manager is chosen for you. CI calls `package.json` scripts by name
(`build`, `typecheck`, `lint`, `test`) and detects npm, pnpm, Yarn or Bun from the lockfile.

## Start a new app from this template

**Once:** mark this repo as a template, create a setup token and store it, and install the
CodeRabbit and Claude GitHub Apps. About five minutes, following
[Setting up repos](.github/setup/README.md#setting-up-repos).

**Then, for each app:**

1. Ask Claude to create it, e.g. *"Create agallant/space-dodge: a one-thumb arcade game for
   phones"*. Claude opens a `Set up agallant/space-dodge` issue here, and the **Repo setup**
   workflow creates the repo and configures its settings, merge gates and GitHub Pages.
2. Add the new repo to the Claude app:
   [github.com/settings/installations](https://github.com/settings/installations) → **Claude** →
   **Configure** → *Repository access*. This is the one step GitHub only allows in a browser.
3. Open a session on the new repo at [claude.ai/code](https://claude.ai/code) and describe the app.

The guide also covers why app access can't be baked into the template, what the setup token can
do, and how to set up a repo without it: **[.github/setup/README.md](.github/setup/README.md)**.

## What's in here

| Path | Purpose |
| --- | --- |
| [`CLAUDE.md`](CLAUDE.md) | How Claude works in the repo: PR workflow, CI contract, PWA and mobile guidance, first-run bootstrap |
| [`.coderabbit.yaml`](.coderabbit.yaml) | CodeRabbit review settings: request changes, then approve |
| [`.github/workflows/`](.github/workflows) | CI, CodeQL, zizmor, Dependency review, PR preview + Lighthouse, deploy, auto-merge; plus Repo setup, which runs only in the template |
| [`.github/setup/`](.github/setup) | Setup script, `main` ruleset JSON, and the setup guide |
| [`.github/actions/setup/`](.github/actions/setup) | Shared step: detect package manager, install Node and dependencies |
| [`.github/lighthouserc.json`](.github/lighthouserc.json) | Lighthouse thresholds for the preview audit |
| `.editorconfig`, `.gitattributes`, `.gitignore`, `.nvmrc` | Editor and Git defaults; Node version for CI |

Changes to this template go through the same PR flow once it's set up (step 5 of the one-time
setup). There's no app here to build, so CI, CodeQL's JS/TS analysis, previews and Lighthouse
pass without doing anything until a `package.json` exists.
