#!/usr/bin/env bash
set -euo pipefail
output="${1:-$(dirname "$0")/../dist/package-arch}"
root="$(cd "$(dirname "$0")/../../.." && pwd)"
mkdir -p "$output/config" "$output/data" "$output/dist" "$output/node_modules/@lazybot/contracts"
if [[ -d "$root/apps/agent/dist" ]]; then cp -R "$root/apps/agent/dist/." "$output/dist/"; fi
cp -R "$root/apps/agent/node_modules/zod" "$output/node_modules/zod"
contract_stage="$(mktemp -d)"
cp -R "$root/packages/contracts/src/." "$contract_stage/"
printf '%s\n' '{"type":"module"}' > "$contract_stage/package.json"
while IFS= read -r file; do
  sed -E -i "s|(from[[:space:]]+['\"])(\.{1,2}/[^'\"]+)(['\"])|\1\2.js\3|g" "$file"
done < <(find "$contract_stage" -name '*.ts' -type f)
"$root/apps/agent/node_modules/.bin/tsc" --noCheck --target ES2022 --module NodeNext --moduleResolution NodeNext --skipLibCheck --outDir "$output/node_modules/@lazybot/contracts/dist" --rootDir "$contract_stage" "$contract_stage/index.ts"
printf '%s\n' '{"name":"@lazybot/contracts","private":true,"type":"module","exports":"./dist/index.js"}' > "$output/node_modules/@lazybot/contracts/package.json"
if [[ -d "$root/apps/agent/node_modules/.cache/ms-playwright" ]]; then cp -R "$root/apps/agent/node_modules/.cache/ms-playwright" "$output/playwright"; fi
cp "$(dirname "$0")/../packaging/lazybot-agent.service" "$output/"
cat > "$output/lazybot-agent" <<'LAZYBOT_LAUNCHER'
#!/usr/bin/env bash
set -euo pipefail
script_dir="$(cd "$(dirname "$0")" && pwd)"
exec node --experimental-specifier-resolution=node "$script_dir/dist/src/cli/main.js" "$@"
LAZYBOT_LAUNCHER
chmod 0700 "$output/lazybot-agent"
printf 'Package created at %s\n' "$output"
