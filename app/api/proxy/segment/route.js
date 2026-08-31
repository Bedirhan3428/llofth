import { Readable } from 'stream';
import { fetchSegment } from '@/lib/hls-proxy';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const targetUrl = searchParams.get('url');

  if (!targetUrl) {
    return new Response('Hata: "url" parametresi zorunludur.', { status: 400 });
  }

  try {
    const axiosRes = await fetchSegment(targetUrl);
    const webStream = Readable.toWeb(axiosRes.data);

    const headers = {
      'Content-Type': 'video/mp2t',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'public, max-age=86400'
    };

    if (axiosRes.headers['content-length']) {
      headers['Content-Length'] = axiosRes.headers['content-length'];
    }

    return new Response(webStream, {
      status: 200,
      headers
    });
  } catch (error) {
    console.error(`[API /api/proxy/segment Hata] ${targetUrl} ->`, error.message);
    return new Response(`Segment Proxy Hatası: ${error.message}`, { status: 502 });
  }
}
