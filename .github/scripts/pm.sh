#!/usr/bin/env bash
# Prints the project's package manager (npm, pnpm, yarn or bun), detected from its lockfile.
set -euo pipefail
if [ -f bun.lock ] || [ -f bun.lockb ]; then echo bun
elif [ -f pnpm-lock.yaml ]; then echo pnpm
elif [ -f yarn.lock ]; then echo yarn
else echo npm
fi
