import { NextResponse } from 'next/server';
import { rewritePlaylist } from '@/lib/hls-proxy';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const playlistUrl = searchParams.get('url');

  if (!playlistUrl) {
    return NextResponse.json({ error: 'Playlist URL parametresi gereklidir.' }, { status: 400 });
  }

  try {
    const rewrittenContent = await rewritePlaylist(playlistUrl);
    
    return new Response(rewrittenContent, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.apple.mpegurl; charset=utf-8',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
      }
    });
  } catch (err) {
    console.error('[API Playlist Proxy Hata]:', err.message);
    return NextResponse.json(
      { error: `Playlist proxy hatası: ${err.message}` },
      { status: 500 }
    );
  }
}
