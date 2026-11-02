#!/usr/bin/env bash
# One-time setup for a repository created from this template. Applies the settings a template
# can't carry over: merge options, the "main" ruleset (merge gates), security features and
# GitHub Pages. Safe to re-run; every step is idempotent.
#
# Usually run for you by the "Repo setup" workflow in the template repo (see
# .github/setup/README.md). To run it yourself you need gh (logged in as a repo admin, or with
# GH_TOKEN set to a token with admin rights) and jq:
#
#   .github/setup/setup-repo.sh                 # repo of the current directory
#   .github/setup/setup-repo.sh owner/name      # any repo you administer
#
# What it does NOT do (GitHub only allows these in the browser; see .github/setup/README.md):
#   - add the repo to the CodeRabbit and Claude GitHub Apps
set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
if [ -t 1 ]; then
  green=$'\033[32m' yellow=$'\033[33m' red=$'\033[31m' bold=$'\033[1m' reset=$'\033[0m'
else
  green='' yellow='' red='' bold='' reset=''
fi
ok()   { printf '  %s✓%s %s\n' "$green" "$reset" "$*"; }
warn() { printf '  %s!%s %s\n' "$yellow" "$reset" "$*"; }
step() { printf '\n%s%s%s\n' "$bold" "$*" "$reset"; }
die()  { printf '%serror:%s %s\n' "$red" "$reset" "$*" >&2; exit 1; }

command -v gh >/dev/null || die "GitHub CLI not found: https://cli.github.com"
command -v jq >/dev/null || die "jq not found: https://jqlang.org/download/"
gh auth status >/dev/null 2>&1 || die "run 'gh auth login' first"

repo="${1:-$(gh repo view --json nameWithOwner --jq .nameWithOwner 2>/dev/null || true)}"
[ -n "$repo" ] || die "can't tell which repo; pass it as owner/name"

info="$(gh api "repos/$repo")" || die "can't read $repo"
[ "$(jq -r .permissions.admin <<<"$info")" = true ] || die "you need admin rights on $repo"
private="$(jq -r .private <<<"$info")"
default_branch="$(jq -r .default_branch <<<"$info")"
owner_type="$(jq -r .owner.type <<<"$info")"
is_template="$(jq -r .is_template <<<"$info")"

printf 'Setting up %s%s%s (%s)\n' "$bold" "$repo" "$reset" "$([ "$private" = true ] && echo private || echo public)"

if [ "$default_branch" != main ]; then
  warn "default branch is '$default_branch'; the workflows expect 'main'. Rename it in Settings → General."
fi

# ---------------------------------------------------------------------------------------------
step "Merge settings"
gh api -X PATCH "repos/$repo" --silent \
  -F allow_auto_merge=true \
  -F allow_squash_merge=true \
  -F allow_merge_commit=false \
  -F allow_rebase_merge=false \
  -F delete_branch_on_merge=true \
  -F allow_update_branch=true \
  -f squash_merge_commit_title=PR_TITLE \
  -f squash_merge_commit_message=PR_BODY
ok "squash-only merges, auto-merge on, branches deleted after merge"

# ---------------------------------------------------------------------------------------------
step "GitHub Actions"
# Workflows declare the permissions they need; everything else gets read-only, and no workflow
# may approve PRs (approval is CodeRabbit's job).
gh api -X PUT "repos/$repo/actions/permissions/workflow" --silent \
  -f default_workflow_permissions=read \
  -F can_approve_pull_request_reviews=false
ok "default token is read-only; workflows can't approve PRs"

if [ "$private" = true ]; then
  gh variable set CODE_SCANNING --repo "$repo" --body off >/dev/null
  warn "private repo: set CODE_SCANNING=off, so CodeQL, zizmor's code scanning upload and"
  warn "Dependency review skip (they need paid GitHub Code Security on private repos)."
  warn "If you have Code Security, delete that variable and re-run this script."
else
  gh variable delete CODE_SCANNING --repo "$repo" >/dev/null 2>&1 || true
fi


# ---------------------------------------------------------------------------------------------
step "Security features"
try() { if "$@" >/dev/null 2>&1; then return 0; else return 1; fi; }

if try gh api -X PUT "repos/$repo/vulnerability-alerts"; then ok "Dependabot alerts"
else warn "couldn't enable Dependabot alerts"; fi

if try gh api -X PUT "repos/$repo/automated-security-fixes"; then ok "Dependabot security update PRs"
else warn "couldn't enable Dependabot security updates"; fi

if try gh api -X PATCH "repos/$repo" --input - <<'JSON'
{"security_and_analysis": {
  "secret_scanning": {"status": "enabled"},
  "secret_scanning_push_protection": {"status": "enabled"}
}}
JSON
then ok "secret scanning with push protection (pushes containing secrets are blocked)"
else warn "couldn't enable secret scanning (private repos need GitHub Secret Protection)"; fi

# ---------------------------------------------------------------------------------------------
step "GitHub Pages (served from the gh-pages branch)"
if [ "$is_template" = true ]; then
  ok "skipped: this is the template repo, which has no app to publish"
else
  if ! gh api "repos/$repo/branches/gh-pages" --silent >/dev/null 2>&1; then
    # Pages can only point at a branch that exists, so seed gh-pages with a placeholder page.
    # The first deploy replaces it.
    placeholder='<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Coming soon</title><p>First deploy pending.</p>'
    tree="$(jq -n --arg html "$placeholder" '{tree: [
      {path: ".nojekyll", mode: "100644", type: "blob", content: ""},
      {path: "index.html", mode: "100644", type: "blob", content: $html}]}' \
      | gh api -X POST "repos/$repo/git/trees" --input - --jq .sha)"
    commit="$(gh api -X POST "repos/$repo/git/commits" \
      -f message="Initialize gh-pages" -f tree="$tree" --jq .sha)"
    gh api -X POST "repos/$repo/git/refs" --silent -f ref=refs/heads/gh-pages -f sha="$commit"
    ok "created gh-pages branch"
  else
    ok "gh-pages branch exists"
  fi

  pages_body='{"build_type":"legacy","source":{"branch":"gh-pages","path":"/"}}'
  pages_ok=0 pages_err=''
  # A repo or branch created seconds ago can briefly be rejected, so retry a few times.
  for attempt in 1 2 3 4 5; do
    if gh api "repos/$repo/pages" --silent >/dev/null 2>&1; then
      method=PUT
    else
      method=POST
    fi
    # No --silent: on failure the response body carries GitHub's validation details.
    if pages_err="$(gh api -X "$method" "repos/$repo/pages" --input - <<<"$pages_body" 2>&1)"; then
      pages_ok=1
      break
    fi
    [ "$attempt" -lt 5 ] && sleep 6
  done
  if [ "$pages_ok" = 1 ]; then
    url="$(gh api "repos/$repo/pages" --jq .html_url 2>/dev/null || true)"
    ok "Pages publishes gh-pages → ${url:-(URL appears after the first build)}"
  else
    warn "couldn't enable Pages: $(tr -s '\n ' ' ' <<<"${pages_err:-unknown error}")"
    [ "$private" = true ] && warn "(Pages on private repos needs a paid plan.)"
    warn "Enable it by hand: Settings → Pages → Deploy from a branch → gh-pages / (root)."
  fi
fi

# ---------------------------------------------------------------------------------------------
step "Ruleset 'main' (merge gates)"
ruleset="$(cat "$here/ruleset-main.json")"
if [ "$private" = true ]; then
  # Without Code Security there are no code scanning results to gate on.
  ruleset="$(jq 'del(.rules[] | select(.type == "code_scanning"))' <<<"$ruleset")"
fi
existing="$(gh api "repos/$repo/rulesets" --jq '.[] | select(.name == "main") | .id' | head -1)"
if [ -n "$existing" ]; then
  gh api -X PUT "repos/$repo/rulesets/$existing" --silent --input - <<<"$ruleset"
  ok "updated ruleset #$existing"
else
  gh api -X POST "repos/$repo/rulesets" --silent --input - <<<"$ruleset"
  ok "created ruleset"
fi
jq -r '.rules[] | select(.type == "required_status_checks")
  | .parameters.required_status_checks[].context' <<<"$ruleset" \
  | sed 's/^/      required check: /'
ok "1 approving review (CodeRabbit's), resolved threads, squash only, no bypass"

# ---------------------------------------------------------------------------------------------
step "Claude GitHub App"
# Adding a repo to an app installation is allowed through the API (with the "GitHub App
# installation repository access" permission), but looking up the installation isn't, so its ID
# comes from CLAUDE_APP_INSTALLATION_ID: the number at the end of the Claude app's settings URL.
claude_added=0
if [ -n "${CLAUDE_APP_INSTALLATION_ID:-}" ]; then
  repo_id="$(jq -r .id <<<"$info")"
  if err="$(gh api -X PUT "user/installations/$CLAUDE_APP_INSTALLATION_ID/repositories/$repo_id" 2>&1)"; then
    claude_added=1
    ok "added ${repo#*/} to the Claude app; Claude sessions can now work in it"
  else
    warn "couldn't add ${repo#*/} to the Claude app: $(tr -s '\n ' ' ' <<<"$err")"
  fi
else
  warn "CLAUDE_APP_INSTALLATION_ID isn't set, so add the repo to the Claude app by hand (below)."
fi

# ---------------------------------------------------------------------------------------------
apps_url="https://github.com/settings/installations"
[ "$owner_type" = Organization ] && apps_url="https://github.com/organizations/${repo%%/*}/settings/installations"
step "If not done already, in the browser (GitHub doesn't allow this from the API)"
echo "  - CodeRabbit: $apps_url → CodeRabbit → Configure → Repository access → add ${repo#*/}"
echo "    (or choose All repositories). Without CodeRabbit nothing can approve, so no PR merges."
if [ "$claude_added" = 0 ]; then
  echo "  - Claude: $apps_url → Claude → Configure → Repository access → add ${repo#*/}"
fi
