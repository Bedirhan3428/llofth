import { NextResponse } from 'next/server';
import { resolveStreamUrl } from '@/lib/scraper';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const pageUrl = searchParams.get('pageUrl') || searchParams.get('url');

  if (!pageUrl) {
    return NextResponse.json(
      { success: false, error: 'Hata: "pageUrl" parametresi zorunludur.' },
      { status: 400 }
    );
  }

  try {
    const data = await resolveStreamUrl(pageUrl);
    return NextResponse.json(data);
  } catch (error) {
    console.error(`[API /api/resolve Hata] ${pageUrl} ->`, error.message);
    return NextResponse.json(
      { success: false, error: `Akış linki çözülemedi: ${error.message}` },
      { status: 500 }
    );
  }
}
