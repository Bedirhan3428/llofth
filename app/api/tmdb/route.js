import { NextResponse } from 'next/server';
import { getTmdbMetadata } from '@/lib/tmdb';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const title = searchParams.get('title');
  const type = searchParams.get('type') || 'tv';

  if (!title) {
    return NextResponse.json({ success: false, error: 'Başlık parametresi zorunludur.' }, { status: 400 });
  }

  try {
    const isMovie = type === 'movie' || type === 'film';
    const metadata = await getTmdbMetadata(title, isMovie);

    if (!metadata) {
      return NextResponse.json({ success: false, error: 'TMDb içeriği bulunamadı.' }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: metadata });
  } catch (err) {
    console.error('[API /api/tmdb Hata]:', err.message);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
