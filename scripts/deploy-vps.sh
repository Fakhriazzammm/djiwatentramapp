#!/bin/bash
# Artifact-only publish on djiwa-vps. Build on CI, never on this VPS.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
if [ "$SCRIPT_DIR" != /opt/djiwatentramapp ] || [ ! -f /opt/supabase-selfhost/docker-compose.yml ]; then
  echo "Deploy requires canonical /opt/djiwatentramapp on djiwa-vps" >&2
  exit 1
fi
if [ "$#" != 2 ]; then
  echo "Usage: $0 <pos|admin|customer|karyawan|djiwapay> <artifact-dir> (build in CI first)" >&2
  exit 1
fi
node "$SCRIPT_DIR/scripts/publish-artifact.mjs" "$1" "$2"
