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

function sanitizeEnvValue(value: string): string {
  // Remove characters that could break or inject into .env files
  // Remove newlines, null bytes, and comment delimiter '#'
  return value.replace(/[\r\n\0#]/g, '');
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { access_token, client_id, client_secret, collect_interval } = body as Record<string, string>;

  const lines: string[] = [];
  if (access_token && typeof access_token === 'string') {
    lines.push(`MELI_ACCESS_TOKEN=${sanitizeEnvValue(access_token)}`);
  }
  if (client_id && typeof client_id === 'string') {
    lines.push(`MELI_CLIENT_ID=${sanitizeEnvValue(client_id)}`);
  }
  if (client_secret && typeof client_secret === 'string') {
    lines.push(`MELI_CLIENT_SECRET=${sanitizeEnvValue(client_secret)}`);
  }
  if (collect_interval && typeof collect_interval === 'string') {
    const interval = parseInt(collect_interval, 10);
    if (!isNaN(interval) && interval >= 15 && interval <= 1440) {
      lines.push(`COLLECT_INTERVAL_MINUTES=${interval}`);
    }
  }
  lines.push('ENABLE_SCRAPING=false');

  fs.writeFileSync(ENV_PATH, lines.join('\n') + '\n', 'utf8');

  return NextResponse.json({
    ok: true,
    message: 'Configurações salvas! Reinicie o servidor para aplicar.',
  });
}
