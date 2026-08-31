import { NextResponse } from 'next/server';
import { fetchSegment } from '@/lib/hls-proxy';
import { Readable } from 'stream';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const segmentUrl = searchParams.get('url');

  if (!segmentUrl) {
    return NextResponse.json({ error: 'Segment URL parametresi gereklidir.' }, { status: 400 });
  }

  try {
    const axiosRes = await fetchSegment(segmentUrl);
    
    // Node.js Stream'i WHATWG ReadableStream'e dönüştür
    const webStream = Readable.toWeb(axiosRes.data);

    return new Response(webStream, {
      status: 200,
      headers: {
        'Content-Type': 'video/mp2t',
        'Content-Length': axiosRes.headers['content-length'] || '',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Cache-Control': 'public, max-age=86400',
      }
    });
  } catch (err) {
    console.error('[API Segment Stream Hata]:', err.message);
    return NextResponse.json(
      { error: `Segment proxy hatası: ${err.message}` },
      { status: 500 }
    );
  }
}
