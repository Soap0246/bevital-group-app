import { useEffect, useState } from 'react';

/** Ticks once a second until `targetIso`. Returns remaining seconds (0 when expired) and a mm:ss label. */
export function useCountdown(targetIso: string | null | undefined) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!targetIso) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [targetIso]);
  if (!targetIso) return { seconds: null as number | null, label: '', expired: false };
  const seconds = Math.max(0, Math.floor((new Date(targetIso).getTime() - now) / 1000));
  const label = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
  return { seconds, label, expired: seconds === 0 };
}
