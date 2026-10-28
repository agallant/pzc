#!/usr/bin/env bash
# Runs a package.json script with the project's package manager (see pm.sh),
# or skips it with a notice when the project doesn't define it. This is how CI stays agnostic
# about which tools a project uses: it calls conventional script names, never tools directly.
#
#   run-script.sh <name>               skip quietly if <name> is missing
#   run-script.sh <name> --required    fail if <name> is missing
set -euo pipefail

name="${1:?usage: run-script.sh <name> [--required]}"
required="${2:-}"
pm="$("$(dirname "$0")/pm.sh")"

if node -e 'const s=require("./package.json").scripts||{}; process.exit(s[process.argv[1]]?0:1)' "$name"; then
  echo "▶ $pm run $name"
  "$pm" run "$name"
elif [ "$required" = "--required" ]; then
  echo "::error::package.json has no \"$name\" script. CI expects one (see CLAUDE.md, 'CI contract')."
  exit 1
else
  echo "::notice::No \"$name\" script in package.json; skipping."
fi
