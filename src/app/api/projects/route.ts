import { NextRequest, NextResponse } from 'next/server';
import { getDb, Project } from '@/lib/db';

export async function GET() {
  const db = getDb();
  const projects = db.prepare('SELECT * FROM projects ORDER BY created_at DESC').all() as Project[];
  return NextResponse.json(projects);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { name } = body;
  if (!name || typeof name !== 'string' || !name.trim()) {
    return NextResponse.json({ error: 'Nome inválido' }, { status: 400 });
  }
  const db = getDb();
  const result = db
    .prepare("INSERT INTO projects (name, created_at) VALUES (?, datetime('now'))")
    .run(name.trim());
  const project = db
    .prepare('SELECT * FROM projects WHERE id = ?')
    .get(result.lastInsertRowid) as Project;
  return NextResponse.json(project, { status: 201 });
}
