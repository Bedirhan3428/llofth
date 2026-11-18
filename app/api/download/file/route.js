import fs from 'fs';
import { Readable } from 'stream';
import { NextResponse } from 'next/server';
import { getJob, markDelivered } from '@/lib/downloader';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request) {
  const id = new URL(request.url).searchParams.get('id');
  const job = id ? getJob(id) : null;

  if (!job || job.status !== 'done' || !job.filePath || !fs.existsSync(job.filePath)) {
    return NextResponse.json({ success: false, error: 'Dosya hazır değil.' }, { status: 404 });
  }

  const { size } = fs.statSync(job.filePath);
  const asciiName = job.fileName.replace(/[^\x20-\x7e]/g, '_');
  const fileStream = fs.createReadStream(job.filePath);

  // Dosya sonuna kadar okunup gönderildiyse sunucudaki kopyayı sil; yarıda kalırsa TTL temizliğine bırak
  let completed = false;
  fileStream.on('end', () => { completed = true; });
  fileStream.on('close', () => {
    if (completed && fileStream.bytesRead >= size) markDelivered(id);
  });

  return new Response(Readable.toWeb(fileStream), {
    status: 200,
    headers: {
      'Content-Type': 'video/mp4',
      'Content-Length': String(size),
      'Content-Disposition': `attachment; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(job.fileName)}`,
      'Cache-Control': 'no-store'
    }
  });
}
