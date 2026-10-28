#!/usr/bin/env bash
# Sanity-checks the build output before anything is published: the folder exists, it has an
# index.html, and that page links a web app manifest that is actually in the build.
# Lighthouse (on the PR preview) checks the rest of the PWA story against the live page.
#
#   check-build.sh <build-dir>
set -euo pipefail

dir="${1:?usage: check-build.sh <build-dir>}"
fail=0

if [ ! -d "$dir" ]; then
  echo "::error::Build output folder '$dir' not found. Build into dist/, or set the BUILD_DIR repository variable."
  exit 1
fi

if [ ! -f "$dir/index.html" ]; then
  echo "::error::$dir/index.html is missing. GitHub Pages serves index.html as the app's entry point."
  exit 1
fi

# Find <link rel="manifest" href="..."> in either attribute order.
href="$(grep -oiE '<link[^>]*rel=["'"'"']?manifest["'"'"']?[^>]*>' "$dir/index.html" \
  | grep -oiE 'href=["'"'"'][^"'"'"']+' | head -1 | sed -E 's/^href=["'"'"']//' || true)"

if [ -z "$href" ]; then
  echo "::error::$dir/index.html has no <link rel=\"manifest\">. This template is for installable PWAs."
  fail=1
else
  # Resolve the href against the build folder: strip any query, origin and the deploy base path.
  path="${href%%[?#]*}"
  case "$path" in http://* | https://*) path="/${path#*://*/}" ;; esac
  if [ -n "${BASE_PATH:-}" ] && [ "$BASE_PATH" != "/" ]; then path="${path#"$BASE_PATH"}"; fi
  path="${path#./}"
  path="${path#/}"
  if [ ! -f "$dir/$path" ]; then
    echo "::error::index.html links manifest '$href', but $dir/$path is not in the build."
    fail=1
  else
    echo "✓ manifest: $dir/$path"
  fi
fi

exit "$fail"
