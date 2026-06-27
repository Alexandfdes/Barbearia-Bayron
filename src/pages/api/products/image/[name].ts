export const prerender = false;

import type { APIRoute } from 'astro';
import { readFile } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { PRODUCT_UPLOAD_DIR, safeUploadName } from '../../../../lib/uploads.js';

const EXT_MIME: Record<string, string> = {
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png':  'image/png',
  '.webp': 'image/webp',
};

// Serve uma imagem de produto que foi feita upload (vive no volume /data/uploads).
export const GET: APIRoute = async ({ params }) => {
  const name = safeUploadName(params.name ?? '');
  if (!name) return new Response('Not found', { status: 404 });

  const type = EXT_MIME[extname(name).toLowerCase()];
  if (!type) return new Response('Not found', { status: 404 });

  try {
    const buf = await readFile(join(PRODUCT_UPLOAD_DIR, name));
    return new Response(buf, {
      status: 200,
      headers: {
        'Content-Type':  type,
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    });
  } catch {
    return new Response('Not found', { status: 404 });
  }
};
