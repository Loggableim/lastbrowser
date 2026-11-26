const RELEASE_TAG = 'v0.1.56';
const WINDOWS_STORE_URL = 'https://apps.microsoft.com/detail/9NJX1T2KXDM3';
const ASSETS = {
  'latest.yml': {
    upstream: `https://github.com/Loggableim/lastbrowser/releases/download/${RELEASE_TAG}/latest.yml`,
    filename: 'latest.yml',
    contentType: 'text/yaml; charset=utf-8',
    disposition: 'attachment; filename="latest.yml"',
  },
};

export async function onRequestGet(context) {
  const file = context.params.file;
  if (file === 'setup.exe' || file === 'portable.exe') {
    return Response.redirect(WINDOWS_STORE_URL, 302);
  }
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
