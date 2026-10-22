import { NextResponse } from 'next/server';
import { tmdbClient } from '@/lib/tmdb';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const imagePath = searchParams.get('path');
  const size = searchParams.get('size') || 'w500';

  if (!imagePath) {
    return NextResponse.json({ error: 'Image path parametresi gereklidir.' }, { status: 400 });
  }

  const cleanPath = imagePath.startsWith('/') ? imagePath : `/${imagePath}`;
  const targetUrl = `https://image.tmdb.org/t/p/${size}${cleanPath}`;

  try {
    const res = await tmdbClient.get(targetUrl, {
      responseType: 'arraybuffer',
      timeout: 10000
    });

    const contentType = res.headers['content-type'] || 'image/jpeg';

    return new Response(res.data, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=604800, immutable',
        'Access-Control-Allow-Origin': '*'
      }
    });
  } catch (err) {
    console.error('[TMDb Image Proxy Hata]:', err.message);
    // Fallback: return a 1x1 transparent PNG or 404
    return new Response(null, { status: 404 });
  }
}
