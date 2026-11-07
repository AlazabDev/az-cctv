#!/usr/bin/env bash
# Read-only verification for the live AZ-CCTV Node/Nitro deployment.
# Does not restart services, apply migrations, edit Nginx, or change production data.
set -euo pipefail

BASE_URL="${1:-https://cctv.alazab.com}"
SERVICE="${AZ_CCTV_SERVICE:-az-cctv.service}"
PORT="${AZ_CCTV_PORT:-3010}"

echo "=== PROJECT RELEASE STATE ==="
git status --short
printf 'COMMIT: '; git rev-parse HEAD
printf 'BRANCH: '; git branch --show-current
echo
echo "=== NITRO BUILD ==="
if [[ ! -f .output/nitro.json || ! -f .output/server/index.mjs ]]; then
  echo "FAIL: Node/Nitro production build not found." >&2
  exit 1
fi
node -e 'const p = require("./.output/nitro.json"); console.log("Nitro preset:",p.preset); if(p.preset!=="node-server") process.exit(1)'
echo
echo "=== SYSTEMD ==="
systemctl --no-pager --full is-active "$SERVICE"
systemctl show "$SERVICE" -p ExecStart -p WorkingDirectory --no-pager
echo
echo "=== NODE LOCAL ==="
if ! ss -lntp | grep -E ":$PORT[[:space:]]"; then
  echo "FAIL: Port $PORT has no listener." >&2
  exit 1
fi
curl -fsS --max-time 15 -o /dev/null -w 'local / HTTP %{http_code}\n' "http://127.0.0.1:$PORT/"
echo
echo "=== PUBLIC HTTPS ROUTES ==="
for path in / /store /projects /auth; do
  code=$(curl -sS -L --max-time 25 --max-redirs 3 -o /dev/null -w '%{http_code}' "$BASE_URL$path")
  echo "$path HTTP $code"
  if [[ "$code" != 2?? && "$code" != 3?? ]]; then
    echo "FAIL: $path is not publicly reachable." >&2
    exit 1
  fi
done
echo
echo "PASS: transport and Node/Nitro health verified."
echo "NOTE: This does not verify authenticated project editing, PDF print, customer acceptance, or on-site cameras."
