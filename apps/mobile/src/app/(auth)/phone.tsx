import React, { useState } from 'react';
import { friendlyError, normalizeMalaysianPhone } from '@bevital/shared';
import { AuthShell } from '@/components/AuthShell';
import { Banner, Button, Input } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { env } from '@/config/env';

/**
 * Phone (SMS OTP) sign-in. The client flow is complete; it only works once an SMS provider is
 * configured in Supabase Auth (a Malaysian gateway via an auth "Send SMS" hook, or Twilio) and
 * EXPO_PUBLIC_PHONE_AUTH_ENABLED=true. Until then the screen explains that instead of failing mysteriously.
 */
export default function PhoneSignIn() {
  const { sendPhoneCode, verifyPhoneCode } = useAuth();
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [sent, setSent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true); setError(null);
    try { await fn(); } catch (e) { setError(friendlyError(e)); } finally { setBusy(false); }
  };

  return (
    <AuthShell back title="Log in with your phone" subtitle="We'll text you a 6-digit code.">
      {!env.phoneAuthEnabled ? <Banner tone="warning" icon="construct-outline" title="Phone sign-in isn't enabled yet" body="It will be available once the SMS provider is connected. Please use email for now." /> : null}
      {error ? <Banner tone="danger" icon="alert-circle" title={error} /> : null}
      {!sent ? (
        <>
          <Input label="Mobile number" value={phone} onChangeText={setPhone} keyboardType="phone-pad" icon="call-outline" placeholder="012-345 6789" />
          <Button label="Send code" disabled={!env.phoneAuthEnabled} loading={busy} onPress={() => run(async () => {
            const e164 = normalizeMalaysianPhone(phone);
            if (!e164) throw new Error('Enter a valid Malaysian phone number');
            await sendPhoneCode(e164);
            setSent(e164);
          })} />
        </>
      ) : (
        <>
          <Input label={`Code sent to ${sent}`} value={code} onChangeText={setCode} keyboardType="number-pad" maxLength={6} icon="keypad-outline" placeholder="123456" />
          <Button label="Verify and log in" loading={busy} disabled={code.length !== 6} onPress={() => run(() => verifyPhoneCode(sent, code))} />
          <Button label="Use a different number" variant="ghost" onPress={() => { setSent(null); setCode(''); }} />
        </>
      )}
    </AuthShell>
  );
}
