// create-payment-session
// Called by the mobile app after initiate_payment()/purchase_package(). Opens a hosted checkout with
// the configured payment provider and stores the provider reference + checkout URL on the payment.
//
// STATUS: implemented against Billplz's v3 Bills API (FPX, cards, e-wallets, DuitNow via the hosted bill
// page). NOT yet exercised against the live Billplz sandbox — it needs BILLPLZ_API_KEY and
// BILLPLZ_COLLECTION_ID. Without them it answers 503 "provider_not_configured"; it never pretends
// that a payment happened. To use another provider (Stripe, Razorpay, ...) replace createBill().
import { corsHeaders, json, serviceClient, userClient } from '../_shared/clients.ts';

const BILLPLZ_BASE = Deno.env.get('BILLPLZ_SANDBOX') === 'false'
  ? 'https://www.billplz.com/api/v3'
  : 'https://www.billplz-sandbox.com/api/v3';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const apiKey = Deno.env.get('BILLPLZ_API_KEY');
  const collection = Deno.env.get('BILLPLZ_COLLECTION_ID');
  if (!apiKey || !collection) return json({ error: 'provider_not_configured' }, 503);

  // 1. Authenticate the caller and load THEIR payment through RLS (payer-only).
  const caller = userClient(req);
  const { data: auth } = await caller.auth.getUser();
  if (!auth.user) return json({ error: 'unauthenticated' }, 401);

  const body = await req.json().catch(() => ({}));
  const paymentId = typeof body.payment_id === 'string' ? body.payment_id : '';
  const { data: payment } = await caller.from('payments').select('*').eq('id', paymentId).maybeSingle();
  if (!payment) return json({ error: 'payment_not_found' }, 404);
  if (payment.status !== 'pending') return json({ error: 'payment_not_pending' }, 409);
  if (payment.checkout_url) return json({ checkout_url: payment.checkout_url }); // idempotent

  // 2. Create the bill. Amount is sent in sen. The webhook URL is where the provider reports the result.
  const { data: profile } = await caller.from('users').select('full_name, email').eq('id', auth.user.id).maybeSingle();
  const form = new URLSearchParams({
    collection_id: collection,
    email: profile?.email ?? auth.user.email ?? '',
    name: profile?.full_name || 'BeVital patient',
    amount: String(Math.round(Number(payment.amount) * 100)),
    callback_url: `${Deno.env.get('SUPABASE_URL')}/functions/v1/payment-webhook`,
    redirect_url: Deno.env.get('PAYMENT_RETURN_URL') ?? 'bevital://payment-return',
    description: payment.booking_id ? 'BeVital physiotherapy appointment' : 'BeVital physiotherapy package',
    reference_1_label: 'Payment',
    reference_1: payment.id,
    reference_2_label: 'Method',
    reference_2: payment.method,
  });
  const res = await fetch(`${BILLPLZ_BASE}/bills`, {
    method: 'POST',
    headers: { Authorization: `Basic ${btoa(`${apiKey}:`)}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form,
  });
  if (!res.ok) {
    console.error('billplz create bill failed', res.status, await res.text());
    return json({ error: 'provider_error' }, 502);
  }
  const bill = await res.json();

  // 3. Persist provider reference + URL (service role: clients cannot write payments).
  const { error } = await serviceClient()
    .from('payments')
    .update({ provider: 'billplz', provider_reference: bill.id, checkout_url: bill.url, status: 'processing' })
    .eq('id', payment.id)
    .eq('status', 'pending');
  if (error) return json({ error: 'persist_failed' }, 500);

  return json({ checkout_url: bill.url });
});
