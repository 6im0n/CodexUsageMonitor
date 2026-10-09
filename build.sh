#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p dist
gnome-extensions pack src \
    --extra-source=lib \
    --schema=schemas/org.gnome.shell.extensions.codex-usage.gschema.xml \
    --out-dir=dist --force
echo 'Built dist/codex-usage@local.shell-extension.zip'
