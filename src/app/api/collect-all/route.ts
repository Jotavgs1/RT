import { NextResponse } from 'next/server';
import { collectAll } from '@/lib/collector';

export async function POST() {
  const result = await collectAll();
  return NextResponse.json(result);
}
