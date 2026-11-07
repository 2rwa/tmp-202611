#!/usr/bin/env bash
# Reuse a previous *successful* published Pages artifact so games can ship
# without replacing the independently validated Safari translator runtime.
set -euo pipefail
echo 'available=false' >> "$GITHUB_OUTPUT"
mkdir -p downloaded/previous-site
headers=(-H "Authorization: Bearer $API_TOKEN" -H "Accept: application/vnd.github+json")
runs=$(curl --fail --silent --show-error --retry 3 "${headers[@]}" \
 "https://api.github.com/repos/${GITHUB_REPOSITORY}/actions/workflows/pages.yml/runs?status=success&per_page=50") || exit 0
for run_id in $(printf '%s' "$runs" | jq -r '.workflow_runs[] | select(.head_branch=="main") | .id'); do
  artifacts=$(curl --fail --silent --show-error --retry 3 "${headers[@]}" \
    "https://api.github.com/repos/${GITHUB_REPOSITORY}/actions/runs/${run_id}/artifacts") || continue
  artifact_id=$(printf '%s' "$artifacts" | jq -r '[.artifacts[] | select(.name=="github-pages" and .expired==false) | .id] | first // empty')
  if [ -z "$artifact_id" ]; then continue; fi
  tmpzip=$(mktemp)
  if ! curl --fail --silent --show-error --location --retry 3 "${headers[@]}" \
    "https://api.github.com/repos/${GITHUB_REPOSITORY}/actions/artifacts/${artifact_id}/zip" -o "$tmpzip"; then
    rm -f "$tmpzip"; continue
  fi
  # Pages upload artifact is a zip containing artifact.tar at its root.
  if ! unzip -p "$tmpzip" artifact.tar | tar -xf - -C downloaded/previous-site; then
    rm -f "$tmpzip"; rm -rf downloaded/previous-site; mkdir -p downloaded/previous-site
    continue
  fi
  rm -f "$tmpzip"
  if [ -s downloaded/previous-site/translate/app.js ] && \
     [ -s downloaded/previous-site/translate/wasm/wllama.wasm ] && \
     [ -s downloaded/previous-site/translate/compat/wllama.js ] && \
     [ -s downloaded/previous-site/translate/compat/wllama.wasm ]; then
    echo "Previous Pages artifact from successful run ${run_id}; preserving validated translator."
    echo 'available=true' >> "$GITHUB_OUTPUT"
    exit 0
  fi
  rm -rf downloaded/previous-site
  mkdir -p downloaded/previous-site
done
echo 'No reusable published Pages artifact found; keep existing Pages deployment unchanged.'
