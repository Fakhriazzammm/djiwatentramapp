# Claude Code guidance

Follow the repository-wide instructions in [`AGENTS.md`](AGENTS.md). This repository uses Supabase; do not follow stale Convex instructions.

Work may span projects, apps, and VPS hosts. Identify the active repository, app, environment, and deployment target from their own instructions before acting. The deployment target documented in this repository applies only to this repository.

For product UI, read [`DESIGN.md`](DESIGN.md) and inspect the existing shared components, theme tokens, and Djiwa 3D asset catalog before making changes. For repository structure and domain context, start with [`README.md`](README.md) and [`PROJECT.md`](PROJECT.md).

Deploy: ikuti [`docs/DEPLOYMENT_VPS_WORKFLOW.md`](docs/DEPLOYMENT_VPS_WORKFLOW.md). Alurnya: build di mesin lain (`scripts/ship-artifacts.sh`), VPS hanya publish lewat timer; jangan build atau `git pull` di VPS. Target repo ini adalah VPS `vps-djiwa-tentram` (checkout `/opt/djiwatentramapp`); Helipod MCP hanya boleh dipakai untuk VPS milik project ini.
