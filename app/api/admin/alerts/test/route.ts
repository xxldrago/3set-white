import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/admin-auth';
import { AdminError, SessionError } from '@/lib/session';
import { requireTelegramSession } from '@/lib/session';
import { prisma } from '@/lib/prisma';
import { enqueueAnomalyAlert } from '@/lib/outbox';
import { enqueueNotification } from '@/lib/outbox';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    await requireRole('administrator');
  } catch (err) {
    if (err instanceof SessionError) {
      // Try to redirect for form submissions
      return NextResponse.redirect(new URL('/login', req.url));
    }
    if (err instanceof AdminError) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    throw err;
  }

  try {
    const telegramId = await requireTelegramSession();
    // Create a test AlertEvent
    const windowLabel = new Date().toISOString().slice(0, 10);
    const alert = await prisma.alertEvent.create({
      data: {
        type: 'payment_drop',
        status: 'firing',
        windowLabel,
        severity: 'warning',
        message: '[TEST] Тестовый алерт аномалии',
        firedAt: new Date(),
        thresholdAtFiring: '30',
        actualValue: '-50',
      },
    });

    // Enqueue notification for this admin
    await enqueueAnomalyAlert('payment_drop', windowLabel, [telegramId]);

    // Redirect back to alerts page
    return NextResponse.redirect(new URL('/admin/alerts', req.url));
  } catch (err) {
    return NextResponse.redirect(new URL('/admin/alerts', req.url));
  }
}
