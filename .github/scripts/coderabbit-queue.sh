#!/usr/bin/env bash
# Shows where this repo stands with CodeRabbit's review allowance (about one review an hour per
# repo, shared by every session working here), so sessions can take turns instead of colliding.
#
#   .github/scripts/coderabbit-queue.sh [owner/repo]
#
# Prints when CodeRabbit last reviewed, when the next review is available, and which open PRs
# are waiting for a review of their latest commit, in turn order. It only sees reviews that
# have been posted, so one still running isn't counted (its PR usually shows as waiting).
# Read-only; needs `gh`.
set -euo pipefail

repo="${1:-}"
if [ -z "$repo" ]; then
  url="$(git remote get-url origin)"
  repo="$(printf '%s' "$url" | sed -E 's#\.git$##; s#^.*[:/]([^/]+/[^/]+)$#\1#')"
fi
bot='coderabbitai[bot]'
window=3600

# Every open PR (the queue), plus every PR of any state updated within the window. Together
# they hold every review from the last hour: its PR is either still open, or was closed or
# merged after the review, which sets updated_at inside the window.
fields='"\(.number) \(.state) \(.draft) \(.user.type) \(.head.sha)"'
open_prs="$(gh api --paginate "repos/$repo/pulls?state=open&per_page=100" --jq ".[] | $fields")"
cutoff="$(date -u -d "@$(($(date -u +%s) - window))" +%Y-%m-%dT%H:%M:%SZ)"
recent_prs=""
page=1
while :; do
  rows="$(gh api "repos/$repo/pulls?state=all&sort=updated&direction=desc&per_page=100&page=$page" \
    --jq ".[] | \"\(.updated_at) \" + $fields")"
  fresh="$(printf '%s\n' "$rows" | awk -v c="$cutoff" '$1 >= c' | cut -d' ' -f2-)"
  recent_prs="$(printf '%s\n%s' "$recent_prs" "$fresh")"
  # Stop at the first page that is short or reaches PRs older than the window.
  [ "$(printf '%s\n' "$rows" | sed '/^$/d' | wc -l)" -eq 100 ] || break
  [ "$(printf '%s\n' "$fresh" | sed '/^$/d' | wc -l)" -eq 100 ] || break
  page=$((page + 1))
done
prs="$(printf '%s\n%s\n' "$open_prs" "$recent_prs" | sed '/^$/d' | sort -u)"

last=""
last_pr=""
waiting=()
while read -r number state draft author_type sha; do
  [ -n "$number" ] || continue
  # CodeRabbit's replies in review threads are also "reviews" (commented, empty body) but use
  # no allowance, so they are left out.
  reviews="$(gh api --paginate "repos/$repo/pulls/$number/reviews?per_page=100" \
    --jq ".[] | select(.user.login==\"$bot\")
      | select(.state != \"COMMENTED\" or .body != \"\")
      | \"\(.submitted_at) \(.commit_id)\"")"
  newest="$(printf '%s\n' "$reviews" | sort | tail -n 1 | cut -d' ' -f1)"
  if [ -n "$newest" ] && [[ "$newest" > "$last" ]]; then
    last="$newest"
    last_pr="$number"
  fi
  # Waiting: open, ready, a person's PR (CodeRabbit never reviews one a bot opened), and
  # CodeRabbit hasn't reviewed its head commit.
  if [ "$state" = open ] && [ "$draft" = false ] && [ "$author_type" != Bot ] &&
    ! printf '%s\n' "$reviews" | grep -q " $sha\$"; then
    waiting+=("$number")
  fi
done <<<"$prs"

now="$(date -u +%s)"
if [ -z "$last" ]; then
  echo "No CodeRabbit review posted in the last hour or on an open PR. A review should be" \
    "available now, unless one is still running."
else
  next=$(($(date -u -d "$last" +%s) + window))
  if [ "$next" -le "$now" ]; then
    echo "Last CodeRabbit review: $last (#$last_pr). A review should be available now," \
      "unless one is still running."
  else
    echo "Last CodeRabbit review: $last (#$last_pr). Next review available at" \
      "$(date -u -d "@$next" +%H:%M) UTC, in $(((next - now + 59) / 60)) min."
  fi
fi

if [ "${#waiting[@]}" -eq 0 ]; then
  echo "No open PR is waiting for a review."
else
  sorted="$(printf '%s\n' "${waiting[@]}" | sort -n | sed 's/^/#/' | paste -sd' ' -)"
  echo "Waiting for a review, in turn order: $sorted"
fi
