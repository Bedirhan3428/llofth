import { NextResponse } from 'next/server';
import { searchContent } from '@/lib/scraper';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get('q');

  if (!query) {
    return NextResponse.json(
      { success: false, error: 'Hata: "q" parametresi zorunludur.' },
      { status: 400 }
    );
  }

  try {
    const results = await searchContent(query);
    return NextResponse.json(results);
  } catch (error) {
    console.error(`[API /api/search Hata] "${query}" ->`, error.message);
    return NextResponse.json(
      { success: false, error: `Arama başarısız: ${error.message}` },
      { status: 500 }
    );
  }
}
