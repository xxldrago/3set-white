import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/admin-auth';
import { AdminError, SessionError } from '@/lib/session';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    await requireRole('administrator');
  } catch (err) {
    if (err instanceof SessionError) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    if (err instanceof AdminError) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    throw err;
  }

  try {
    const body = await req.json();
    const { type, muted } = body as { type: string; muted: boolean };

    if (!type) {
      return NextResponse.json({ error: 'type_required' }, { status: 400 });
    }

    const key = 'alert.mutedTypes';
    const existing = await prisma.setting.findUnique({ where: { key } });
    let mutedTypes: string[] = [];

    if (existing?.value) {
      try {
        mutedTypes = JSON.parse(existing.value);
      } catch {
        mutedTypes = [];
      }
    }

    if (muted && !mutedTypes.includes(type)) {
      mutedTypes.push(type);
    } else if (!muted) {
      mutedTypes = mutedTypes.filter((t) => t !== type);
    }

    await prisma.setting.upsert({
      where: { key },
      create: { key, value: JSON.stringify(mutedTypes) },
      update: { value: JSON.stringify(mutedTypes) },
    });

    return NextResponse.json({ ok: true, mutedTypes });
  } catch (err) {
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}
