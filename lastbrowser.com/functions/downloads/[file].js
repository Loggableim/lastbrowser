const RELEASE_TAG = 'v0.1.3';
const ASSETS = {
  'setup.exe': {
    upstream: `https://github.com/Loggableim/lastbrowser/releases/download/${RELEASE_TAG}/Lastbrowser-0.1.3-x64-setup.exe`,
    filename: 'Lastbrowser-0.1.3-x64-setup.exe',
    contentType: 'application/octet-stream',
    disposition: 'attachment; filename="Lastbrowser-0.1.3-x64-setup.exe"',
  },
  'portable.exe': {
    upstream: `https://github.com/Loggableim/lastbrowser/releases/download/${RELEASE_TAG}/Lastbrowser-0.1.3-x64-portable.exe`,
    filename: 'Lastbrowser-0.1.3-x64-portable.exe',
    contentType: 'application/octet-stream',
    disposition: 'attachment; filename="Lastbrowser-0.1.3-x64-portable.exe"',
  },
  'latest.yml': {
    contentType: 'text/yaml; charset=utf-8',
    body: `version: 0.1.3\nfiles:\n  - url: setup.exe\n    sha512: OyPNSchr3UPEdwzBvOLU7DhiZS1ge7B0dDULgcYlE8xNN85SUk+Jd2VK4TbmYiFVc6cPbEpvL0N5I5gscxRIsA==\n    size: 204875086\npath: setup.exe\nsha512: OyPNSchr3UPEdwzBvOLU7DhiZS1ge7B0dDULgcYlE8xNN85SUk+Jd2VK4TbmYiFVc6cPbEpvL0N5I5gscxRIsA==\nreleaseDate: '2026-05-25T20:23:46.403Z'\n`,
  },
};

export async function onRequestGet(context) {
  const file = context.params.file;
  const asset = ASSETS[file];

  if (!asset) {
    return new Response('Not found', { status: 404, headers: { 'content-type': 'text/plain; charset=utf-8' } });
  }

  if (asset.body) {
    return new Response(asset.body, {
      headers: {
        'content-type': asset.contentType,
        'cache-control': 'public, max-age=300',
        'x-robots-tag': 'noindex',
      },
    });
  }

  const upstream = await fetch(asset.upstream, {
    headers: {
      'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125 Safari/537.36',
      'accept': 'application/octet-stream,*/*',
    },
    redirect: 'follow',
  });

  if (!upstream.ok) {
    return new Response(`Upstream error: ${upstream.status}`, {
      status: 502,
      headers: { 'content-type': 'text/plain; charset=utf-8', 'x-robots-tag': 'noindex' },
    });
  }

  const headers = new Headers(upstream.headers);
  headers.set('content-type', asset.contentType);
  headers.set('content-disposition', asset.disposition);
  headers.set('cache-control', 'public, max-age=3600');
  headers.set('x-robots-tag', 'noindex');
  headers.delete('content-length');

  return new Response(upstream.body, {
    status: 200,
    headers,
  });
}
