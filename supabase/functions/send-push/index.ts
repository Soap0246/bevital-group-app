// send-push
// Delivers a notification row as an Expo push message. Wire it to a Database Webhook on
// INSERT into public.notifications (see docs/DEPLOYMENT.md), with the header
// `x-webhook-secret: <PUSH_WEBHOOK_SECRET>`. Appointment reminders, payment confirmations,
// therapist assignment and home-visit updates all reach devices through this one function.
// STATUS: not yet run against a real device (needs a physical device + EAS project id).
import { json, safeEqual, serviceClient } from '../_shared/clients.ts';

interface NotificationRecord { id: string; user_id: string; title: string; body: string; type: string; data: Record<string, unknown> }

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
  const secret = Deno.env.get('PUSH_WEBHOOK_SECRET');
  if (!secret) return json({ error: 'not_configured' }, 503);
  if (!safeEqual(req.headers.get('x-webhook-secret') ?? '', secret)) return json({ error: 'unauthorized' }, 401);

  const payload = await req.json().catch(() => null);
  const n = payload?.record as NotificationRecord | undefined;
  if (!n?.user_id) return json({ error: 'bad_payload' }, 400);

  const db = serviceClient();
  const { data: tokens } = await db.from('push_tokens').select('token').eq('user_id', n.user_id);
  if (!tokens?.length) return json({ ok: true, sent: 0 });

  // Notification text can contain health context (service, time). Keep payloads minimal and never include clinical data.
  const messages = tokens.map((t) => ({ to: t.token, title: n.title, body: n.body, data: { notification_id: n.id, ...n.data }, sound: 'default', channelId: 'default' }));
  const res = await fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...(Deno.env.get('EXPO_ACCESS_TOKEN') ? { Authorization: `Bearer ${Deno.env.get('EXPO_ACCESS_TOKEN')}` } : {}) },
    body: JSON.stringify(messages),
  });
  if (!res.ok) { console.error('expo push failed', res.status, await res.text()); return json({ error: 'push_failed' }, 502); }

  await db.from('notifications').update({ push_sent_at: new Date().toISOString() }).eq('id', n.id);
  return json({ ok: true, sent: messages.length });
});
