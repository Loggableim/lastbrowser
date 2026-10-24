/** @typedef {{ r2Key: string, contentType: string, disposition: string, sha256: string, bytes: number, upstream?: string }} BetaAsset */

export const BETA_VERSION_LABEL = '0.1.57-demo.4';

/** @type {Record<string, BetaAsset>} */
export const BETA_ASSETS = {
  'Lastbrowser-0.1.57-demo.4-x64-setup.exe': {
    r2Key: 'beta/Lastbrowser-0.1.57-demo.4-x64-setup.exe',
    contentType: 'application/octet-stream',
    disposition: 'attachment; filename="Lastbrowser-0.1.57-demo.4-x64-setup.exe"',
    sha256: 'b0ed565e72eb49ded0fc1e3dc8c8643b83e3a6a6d3c7eb24b3415b6b96aeb319',
    bytes: 383098440,
  },
  'Lastbrowser-0.1.57-demo.4-x64-portable.exe': {
    r2Key: 'beta/Lastbrowser-0.1.57-demo.4-x64-portable.exe',
    contentType: 'application/octet-stream',
    disposition: 'attachment; filename="Lastbrowser-0.1.57-demo.4-x64-portable.exe"',
    sha256: 'a19ce435c62b5a016ac458c70f08cddeac5674d27f9ebb5df2247d309941ab6d',
    bytes: 382744690,
  },
  'Lastbrowser-0.1.57-demo.4-x86_64.AppImage': {
    r2Key: 'beta/Lastbrowser-0.1.57-demo.4-x86_64.AppImage',
    contentType: 'application/octet-stream',
    disposition: 'attachment; filename="Lastbrowser-0.1.57-demo.4-x86_64.AppImage"',
    sha256: '4d6080c9f0cb044effd2376928333d17c092ceece374bbdfe737e1ba7a175870',
    bytes: 403976168,
  },
};
