import { NextResponse } from 'next/server';
import { scrapeSeries } from '@/lib/scraper';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const targetUrl = searchParams.get('url');
  const forceRefresh = searchParams.get('refresh') === 'true';

  if (!targetUrl) {
    return NextResponse.json(
      { success: false, error: 'Hata: "url" parametresi zorunludur.' },
      { status: 400 }
    );
  }

  try {
    const seriesData = await scrapeSeries(targetUrl, forceRefresh);
    return NextResponse.json(seriesData);
  } catch (error) {
    console.error(`[API /api/series Hata] ${targetUrl} ->`, error.message);
    return NextResponse.json(
      { success: false, error: `Dizi ayrıştırılamadı: ${error.message}` },
      { status: 500 }
    );
  }
}
