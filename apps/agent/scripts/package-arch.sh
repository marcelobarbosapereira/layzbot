#!/usr/bin/env bash
set -euo pipefail
output="${1:-$(dirname "$0")/../dist/package-arch}"
root="$(cd "$(dirname "$0")/../../.." && pwd)"
mkdir -p "$output/config" "$output/data"
if [[ -d "$root/apps/agent/dist" ]]; then cp -R "$root/apps/agent/dist/." "$output/"; fi
if [[ -d "$root/apps/agent/node_modules/.cache/ms-playwright" ]]; then cp -R "$root/apps/agent/node_modules/.cache/ms-playwright" "$output/playwright"; fi
cp "$(dirname "$0")/../packaging/lazybot-agent.service" "$output/"
printf 'Package created at %s\n' "$output"
