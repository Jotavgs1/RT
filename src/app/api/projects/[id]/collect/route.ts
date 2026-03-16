import { NextRequest, NextResponse } from 'next/server';
import { collectProject } from '@/lib/collector';

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const projectId = parseInt(id, 10);
  const result = await collectProject(projectId);
  return NextResponse.json(result);
}
