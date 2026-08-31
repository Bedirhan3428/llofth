import { rewritePlaylist } from '@/lib/hls-proxy';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const targetUrl = searchParams.get('url');

  if (!targetUrl) {
    return new Response('Hata: "url" parametresi zorunludur.', { status: 400 });
  }

  try {
    const rewrittenContent = await rewritePlaylist(targetUrl);

    return new Response(rewrittenContent, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.apple.mpegurl; charset=utf-8',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-cache, no-store, must-revalidate'
      }
    });
  } catch (error) {
    console.error(`[API /api/proxy/playlist Hata] ${targetUrl} ->`, error.message);
    return new Response(`Playlist Proxy Hatası: ${error.message}`, { status: 502 });
  }
}
