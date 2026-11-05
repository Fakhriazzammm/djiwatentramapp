#!/bin/bash
# Compatibility entrypoint: Admin is published from a validated CI artifact.
set -euo pipefail
if [ "$#" != 1 ]; then
  echo "Usage: $0 <admin-artifact-dir>; build in CI, not on the production VPS" >&2
  exit 1
fi
exec bash "$(dirname "$0")/deploy-vps.sh" admin "$1"
