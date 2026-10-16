#!/bin/sh
# Run an extracted Lastbrowser AppDir without libfuse2.
#
# The AppImage file itself needs libfuse.so.2 unless the runtime is started
# with APPIMAGE_EXTRACT_AND_RUN=1. After --appimage-extract, AppRun only finds
# the Lastbrowser binary when APPDIR is the extracted directory. Without it,
# exec fails with "/Lastbrowser: No such file or directory".
#
#   ./Lastbrowser-*.AppImage --appimage-extract
#   ./run-extracted-appimage.sh squashfs-root
set -eu
if [ "$#" -lt 1 ] || [ "$1" = "-h" ] || [ "$1" = "--help" ]; then
  echo "usage: run-extracted-appimage.sh <extracted-appdir> [lastbrowser args...]" >&2
  exit 2
fi
root=$1
shift
APPDIR=$(CDPATH= cd -- "$root" && pwd)
if [ ! -x "$APPDIR/AppRun" ]; then
  echo "AppRun is missing in $APPDIR" >&2
  exit 1
fi
export APPDIR
exec "$APPDIR/AppRun" "$@"
