#!/bin/sh
set -eu
# The published chrome-sandbox helper needs setuid outside a sandbox.
# Flatpak clears that bit, so this preview starts without the Chromium
# setuid sandbox. The Flatpak sandbox is the confinement boundary.
exec /app/extra/lastbrowser/Lastbrowser --no-sandbox --disable-dev-shm-usage "$@"
