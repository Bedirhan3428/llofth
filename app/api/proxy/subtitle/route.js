import { NextResponse } from 'next/server';
import axios from 'axios';
import { DEFAULT_HEADERS } from '@/lib/hls-proxy';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const subtitleUrl = searchParams.get('url');

  if (!subtitleUrl) {
    return NextResponse.json({ error: 'Subtitle URL parametresi gereklidir.' }, { status: 400 });
  }

  try {
    const res = await axios.get(subtitleUrl, {
      headers: {
        ...DEFAULT_HEADERS,
        'Accept': 'text/vtt,text/plain,*/*'
      },
      responseType: 'text',
      timeout: 10000
    });

    return new Response(res.data, {
      status: 200,
      headers: {
        'Content-Type': 'text/vtt; charset=utf-8',
        'Cache-Control': 'public, max-age=86400',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS'
      }
    });
  } catch (err) {
    console.error('[Subtitle Proxy Hata]:', err.message);
    return NextResponse.json(
      { error: `Subtitle proxy hatası: ${err.message}` },
      { status: 500 }
    );
  }
}
