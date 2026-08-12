import crypto from 'crypto';
import { requireAuth } from '@/lib/auth-middleware';
import { ROLES } from '@/lib/auth-config';
import { resultImageContent } from '@/lib/result-images';

/**
 * GET /api/lab/results/images/[id]
 *
 * Streams one analyzer-generated image (a cell-distribution histogram).
 *
 * These are patient data, so they sit behind the same authentication as every
 * other result — deliberately not written under /public, which would have made
 * them world-readable to anyone who guessed a filename.
 *
 * `mime_type` is only ever written from a verified file signature (see
 * lib/result-images.js), and that allowlist has no SVG in it, so this cannot be
 * turned into a vector for script-bearing markup served from our own origin.
 * `nosniff` is set anyway so a browser will not second-guess the type.
 *
 * Caching is `private` — patient images must never be held in a shared proxy.
 * A re-delivered message can replace an image in place under the same id, so
 * the response is revalidated against a content ETag rather than marked
 * immutable.
 */
export async function GET(request, { params }) {
  try {
    const { id } = await params;
    const { response } = await requireAuth(...ROLES.REPORT_READ);
    if (response) return response;

    const image = await resultImageContent(id);
    if (!image || !image.content) {
      return Response.json({ error: 'Image not found' }, { status: 404 });
    }

    const bytes = Buffer.isBuffer(image.content) ? image.content : Buffer.from(image.content);
    const etag = `"${crypto.createHash('sha1').update(bytes).digest('hex')}"`;

    if (request.headers.get('if-none-match') === etag) {
      return new Response(null, {
        status: 304,
        headers: { ETag: etag, 'Cache-Control': 'private, max-age=300, must-revalidate' },
      });
    }

    return new Response(bytes, {
      status: 200,
      headers: {
        'Content-Type': image.mime_type || 'application/octet-stream',
        'Content-Length': String(bytes.length),
        'Content-Disposition': 'inline',
        'Cache-Control': 'private, max-age=300, must-revalidate',
        'X-Content-Type-Options': 'nosniff',
        ETag: etag,
      },
    });
  } catch (err) {
    console.error('result image error:', err);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
