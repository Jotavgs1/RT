import { NextRequest, NextResponse } from 'next/server';
import { collectProject } from '@/lib/collector';

export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const projectId = parseInt(params.id, 10);
  const result = await collectProject(projectId);
  return NextResponse.json(result);
}
