import { BETA_ASSETS } from '../../_lib/beta-download-assets.js';

export async function onRequestGet(context) {
  const file = context.params.file;
  const asset = BETA_ASSETS[file];

  if (!asset) {
    return new Response('Not found', { status: 404, headers: { 'content-type': 'text/plain; charset=utf-8', 'x-robots-tag': 'noindex' } });
  }

  const bucket = context.env.BETA_DOWNLOADS;
  if (bucket) {
    const object = await bucket.get(asset.r2Key);
    if (object) {
      const headers = new Headers();
      headers.set('content-type', asset.contentType);
      headers.set('content-disposition', asset.disposition);
      headers.set('cache-control', 'public, max-age=300');
      headers.set('x-robots-tag', 'noindex');
      if (object.httpMetadata?.contentType) {
        headers.set('content-type', object.httpMetadata.contentType);
      }
      if (object.size) {
        headers.set('content-length', String(object.size));
      }
      headers.set('x-lastbrowser-sha256', asset.sha256);
      return new Response(object.body, { status: 200, headers });
    }
  }

  if (asset.upstream) {
    const upstream = await fetch(asset.upstream, {
      headers: {
        'user-agent': 'Mozilla/5.0 (compatible; LastbrowserBetaDownload/1.0)',
        accept: 'application/octet-stream,*/*',
      },
      redirect: 'follow',
    });

    if (upstream.ok) {
      const headers = new Headers(upstream.headers);
      headers.set('content-type', asset.contentType);
      headers.set('content-disposition', asset.disposition);
      headers.set('cache-control', 'public, max-age=300');
      headers.set('x-robots-tag', 'noindex');
      headers.delete('content-length');
      headers.set('x-lastbrowser-sha256', asset.sha256);
      return new Response(upstream.body, { status: 200, headers });
    }
  }

  return new Response('Beta artifact not available yet', {
    status: 503,
    headers: { 'content-type': 'text/plain; charset=utf-8', 'x-robots-tag': 'noindex' },
  });
}
