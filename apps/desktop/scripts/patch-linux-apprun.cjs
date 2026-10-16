const fs = require('node:fs');
const path = require('node:path');

const APPDIR_BLOCK = /if \[ -z "\$APPDIR" \] ; then\n[\s\S]*?\nfi\n/;

const PATCHED_APPDIR_BLOCK = `if [ -z "$APPDIR" ] ; then
  # The AppImage runtime sets APPDIR when FUSE mounts the image. After
  # --appimage-extract, derive it from this script. Do not search for "$1":
  # the first argument is an app flag, the walk reaches /, and exec becomes
  # /Lastbrowser.
  APPDIR="$(dirname "$(readlink -f "\${THIS}")")"
fi
`;

function patchAppRunText(text) {
  if (text.includes('Do not search for "$1"') && text.includes('APPDIR="$(dirname "$(readlink -f "${THIS}")")"')) {
    return text;
  }
  // electron-builder 26 searches for AppRun itself. Only the older template
  // walks "$1" and collapses APPDIR to / when the extracted script is invoked
  // with application arguments.
  if (!text.includes('"$path/$1"')) return text;
  const next = text.replace(APPDIR_BLOCK, PATCHED_APPDIR_BLOCK);
  if (next === text || next.includes('"$path/$1"')) {
    throw new Error('Failed to patch AppRun APPDIR detection');
  }
  return next;
}

async function patchLinuxAppRun(context) {
  if (context.electronPlatformName !== 'linux') return;
  const appRunPath = path.join(context.appOutDir, 'AppRun');
  if (!fs.existsSync(appRunPath)) return;
  const current = fs.readFileSync(appRunPath, 'utf8');
  const patched = patchAppRunText(current);
  if (patched !== current) fs.writeFileSync(appRunPath, patched);
}

module.exports = patchLinuxAppRun;
module.exports.patchAppRunText = patchAppRunText;
