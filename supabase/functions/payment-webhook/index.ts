// payment-webhook
// The ONLY path by which a payment can become "succeeded". The provider POSTs here; we verify its
// signature, then call the service-role-only SQL function confirm_payment(), which re-checks the amount,
// is idempotent for retries, and moves the booking forward. Anything unsigned or malformed is rejected.
//
// Deployed with verify_jwt = false (the provider has no Supabase JWT) — the HMAC signature is the auth.
// STATUS: implements Billplz's X-Signature scheme; not yet exercised against the live Billplz sandbox.
import { hmacSha256Hex, json, safeEqual, serviceClient } from '../_shared/clients.ts';

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const secret = Deno.env.get('BILLPLZ_X_SIGNATURE_KEY');
  if (!secret) return json({ error: 'provider_not_configured' }, 503);

  const raw = await req.text();
  const params = new URLSearchParams(raw);
  const received = params.get('x_signature') ?? '';
  params.delete('x_signature');

  // Billplz: sort keys alphabetically, join `key + value` with "|", HMAC-SHA256 with the X Signature key.
  const source = [...params.entries()]
    .sort(([a], [b]) => a.toLowerCase().localeCompare(b.toLowerCase()))
    .map(([k, v]) => `${k}${v}`)
    .join('|');
  const expected = await hmacSha256Hex(secret, source);
  if (!received || !safeEqual(expected, received.toLowerCase())) {
    console.warn('payment-webhook: signature mismatch');
    return json({ error: 'invalid_signature' }, 401);
  }

  const billId = params.get('id');
  const paid = params.get('paid') === 'true';
  if (!billId) return json({ error: 'missing_id' }, 400);

  const db = serviceClient();
  const { data: payment } = await db.from('payments').select('id, amount, status').eq('provider', 'billplz').eq('provider_reference', billId).maybeSingle();
  if (!payment) return json({ error: 'unknown_payment' }, 404);

  const payload = Object.fromEntries(params.entries());
  if (paid) {
    const paidRinggit = Number(params.get('paid_amount') ?? params.get('amount') ?? '0') / 100;
    const { error } = await db.rpc('confirm_payment', { p_payment_id: payment.id, p_provider_reference: billId, p_amount: paidRinggit, p_raw: payload });
    if (error) { console.error('confirm_payment failed', error); return json({ error: 'confirm_failed' }, 500); }
  } else {
    const { error } = await db.rpc('fail_payment', { p_payment_id: payment.id, p_reason: 'Payment was not completed', p_raw: payload });
    if (error) { console.error('fail_payment failed', error); return json({ error: 'fail_failed' }, 500); }
  }
  return json({ ok: true }); // 200 stops provider retries
});
