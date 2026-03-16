import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const ENV_PATH = path.join(process.cwd(), '.env.local');

export async function GET() {
  const hasToken = !!(process.env.MELI_ACCESS_TOKEN);
  const hasClientId = !!(process.env.MELI_CLIENT_ID);
  return NextResponse.json({
    configured: hasToken,
    hasToken,
    hasClientId,
    tokenPreview: process.env.MELI_ACCESS_TOKEN
      ? `...${process.env.MELI_ACCESS_TOKEN.slice(-6)}`
      : null,
  });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { access_token, client_id, client_secret, collect_interval } = body as Record<string, string>;

  const lines: string[] = [];
  if (access_token) lines.push(`MELI_ACCESS_TOKEN=${access_token}`);
  if (client_id) lines.push(`MELI_CLIENT_ID=${client_id}`);
  if (client_secret) lines.push(`MELI_CLIENT_SECRET=${client_secret}`);
  if (collect_interval) lines.push(`COLLECT_INTERVAL_MINUTES=${collect_interval}`);
  lines.push('ENABLE_SCRAPING=false');

  fs.writeFileSync(ENV_PATH, lines.join('\n') + '\n', 'utf8');

  return NextResponse.json({
    ok: true,
    message: 'Configurações salvas! Reinicie o servidor para aplicar.',
  });
}
