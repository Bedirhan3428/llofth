import { NextResponse } from 'next/server';
import { getSinricConfig, saveSinricConfig, initSinricPro } from '@/lib/sinricService';

export const dynamic = 'force-dynamic';

export async function GET() {
  const config = getSinricConfig();
  return NextResponse.json({
    configured: !!(config.appKey && config.appSecret && config.deviceId),
    targetTvId: config.targetTvId || 'SALON',
    deviceId: config.deviceId ? `${config.deviceId.slice(0, 6)}...` : null
  });
}

export async function POST(request) {
  try {
    const body = await request.json();
    const { appKey, appSecret, deviceId, targetTvId } = body;

    if (!appKey || !appSecret || !deviceId) {
      return NextResponse.json({ success: false, error: 'appKey, appSecret ve deviceId zorunludur.' }, { status: 400 });
    }

    saveSinricConfig({
      appKey: appKey.trim(),
      appSecret: appSecret.trim(),
      deviceId: deviceId.trim(),
      targetTvId: (targetTvId || 'SALON').trim().toUpperCase()
    });

    const started = await initSinricPro();

    return NextResponse.json({
      success: true,
      started,
      message: 'Sinric Pro bilgileri kaydedildi ve köprü başlatıldı.'
    });
  } catch (err) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
