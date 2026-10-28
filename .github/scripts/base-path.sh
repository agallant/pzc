#!/usr/bin/env bash
# Prints the URL path the site is served from on GitHub Pages, with leading and trailing slash,
# for builds that need an absolute base (service worker scope, manifest start_url, router base).
#
#   base-path.sh                 -> /my-repo/                 (main deploy)
#   base-path.sh pr-preview/pr-7 -> /my-repo/pr-preview/pr-7/ (PR preview)
#
# Uses SITE_BASE_PATH when set (the repository variable for a custom domain, usually "/"),
# "/" for a <user>.github.io repository, and "/<repo>/" otherwise.
set -euo pipefail

sub="${1:-}"
repo="${GITHUB_REPOSITORY#*/}"

if [ -n "${SITE_BASE_PATH:-}" ]; then
  base="$SITE_BASE_PATH"
elif [[ "$repo" == *.github.io ]]; then
  base="/"
else
  base="/$repo/"
fi

# Normalize to exactly one leading and one trailing slash.
base="/${base#/}"
base="${base%/}/"
if [ -n "$sub" ]; then
  sub="${sub#/}"
  sub="${sub%/}"
  base="${base}${sub}/"
fi
echo "$base"
