import { NextResponse } from 'next/server';
import { startDownload, getJob, publicJob } from '@/lib/downloader';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request) {
  try {
    const { pageUrl, title } = await request.json();
    if (!pageUrl) {
      return NextResponse.json({ success: false, error: 'pageUrl zorunludur.' }, { status: 400 });
    }
    const job = startDownload({ pageUrl, title });
    return NextResponse.json({ success: true, job });
  } catch (err) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function GET(request) {
  const id = new URL(request.url).searchParams.get('id');
  const job = id ? getJob(id) : null;
  if (!job) {
    return NextResponse.json({ success: false, error: 'İndirme bulunamadı.' }, { status: 404 });
  }
  return NextResponse.json({ success: true, job: publicJob(job) });
}
