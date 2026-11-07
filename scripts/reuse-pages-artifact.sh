#!/usr/bin/env bash
# Reuse a previous *successful* published Pages artifact so games can ship
# without replacing the independently validated Safari translator runtime.
set -euo pipefail
echo 'available=false' >> "$GITHUB_OUTPUT"
mkdir -p downloaded/previous-site
headers=(-H "Authorization: Bearer $API_TOKEN" -H "Accept: application/vnd.github+json")
runs=$(curl --fail --silent --show-error --retry 3 "${headers[@]}" \
 "https://api.github.com/repos/${GITHUB_REPOSITORY}/actions/workflows/pages.yml/runs?status=success&per_page=50") || runs='{"workflow_runs":[]}'
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
# Prior Pages artifacts have short retention. Reuse the *currently published*
# translator as a last resort; do not ship mock JavaScript or mismatched WASM.
base="https://${GITHUB_REPOSITORY%%/*}.github.io/${GITHUB_REPOSITORY#*/}/translate"
files=(index.html style.css app.js wasm/wllama.wasm compat/wllama.js compat/wllama.wasm)
ok=true
for file in "${files[@]}"; do
  mkdir -p "downloaded/previous-site/translate/$(dirname "$file")"
  if ! curl --fail --silent --show-error --location --retry 3 \
    "$base/$file" -o "downloaded/previous-site/translate/$file"; then
    ok=false
    break
  fi
  if [ ! -s "downloaded/previous-site/translate/$file" ]; then ok=false; break; fi
done
if [ "$ok" = true ] && \
   grep -q 'github-button' downloaded/previous-site/translate/index.html && \
   grep -q -E 'wllama|GGUF|plamo' downloaded/previous-site/translate/app.js; then
  echo 'Preserving currently published translator JS/WASM pair.'
  echo 'available=true' >> "$GITHUB_OUTPUT"
  exit 0
fi
rm -rf downloaded/previous-site
echo 'No verified translator runtime found; preserve existing Pages deployment.'
