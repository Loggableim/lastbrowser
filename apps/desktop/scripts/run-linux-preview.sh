#!/bin/sh
# Default Linux start. A normal launch does not need a host libfuse2 package.
#
# The AppImage runtime can mount only when libfuse.so.2 and fusermount are
# available. This launcher extracts and runs instead, and it also points
# LD_LIBRARY_PATH at a bundled libfuse.so.2 when one was packaged beside it.
#
#   ./run-linux-preview.sh
#   ./run-linux-preview.sh --no-sandbox
#   LASTBROWSER_APPIMAGE_MOUNT=1 ./run-linux-preview.sh
set -eu
here=$(CDPATH= cd -- "$(dirname "$0")" && pwd)
appimage=
if [ "${1:-}" != "" ] && [ -f "$1" ]; then
  appimage=$1
  shift
fi
if [ -z "$appimage" ]; then
  for candidate in "$here"/*.AppImage "$here"/../*.AppImage; do
    if [ -f "$candidate" ]; then
      appimage=$candidate
      break
    fi
  done
fi
if [ -z "$appimage" ] || [ ! -f "$appimage" ]; then
  echo "No AppImage found next to run-linux-preview.sh" >&2
  exit 1
fi
if [ -f "$here/lib/libfuse.so.2" ]; then
  export LD_LIBRARY_PATH="$here/lib${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
fi
# Optional FUSE mount. That mode still needs host fusermount.
if [ "${LASTBROWSER_APPIMAGE_MOUNT:-}" != "1" ]; then
  export APPIMAGE_EXTRACT_AND_RUN=1
fi
exec "$appimage" "$@"
