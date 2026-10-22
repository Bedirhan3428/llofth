import { NextResponse } from 'next/server';
import { remoteHub } from '@/lib/remoteHub';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const deviceId = remoteHub.normalizeDeviceId(searchParams.get('deviceId') || 'SALON');
  const userAgent = request.headers.get('user-agent') || '';
  const ip = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || '127.0.0.1';

  let streamController = null;
  let keepAliveInterval = null;

  const stream = new ReadableStream({
    start(controller) {
      streamController = controller;

      // Hub'a kaydet
      remoteHub.registerClient(deviceId, controller, {
        userAgent,
        ip,
        currentUrl: searchParams.get('url') || '',
        mediaTitle: searchParams.get('title') || ''
      });

      // Bağlantı başlangıç karşılama mesajı
      const welcome = {
        action: 'connected',
        deviceId,
        message: `Cihaz ${deviceId} uzaktan kumanda merkezine bağlandı.`,
        timestamp: Date.now()
      };
      controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(welcome)}\n\n`));

      // 20 saniyede bir SSE keepalive ping'i gönder (bağlantının düşmesini önler)
      keepAliveInterval = setInterval(() => {
        try {
          controller.enqueue(new TextEncoder().encode(`: ping\n\n`));
        } catch (e) {
          clearInterval(keepAliveInterval);
        }
      }, 20000);
    },
    cancel() {
      if (keepAliveInterval) clearInterval(keepAliveInterval);
      if (streamController) {
        remoteHub.unregisterClient(deviceId, streamController);
      }
    }
  });

  // Client bağlantıyı kapattığında temizle
  request.signal.addEventListener('abort', () => {
    if (keepAliveInterval) clearInterval(keepAliveInterval);
    if (streamController) {
      remoteHub.unregisterClient(deviceId, streamController);
    }
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform, no-store',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*'
    }
  });
}
