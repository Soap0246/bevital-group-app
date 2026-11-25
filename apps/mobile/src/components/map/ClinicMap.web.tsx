import React, { useEffect, useMemo, useRef } from 'react';
import { View } from 'react-native';
import { colors, radius } from '@/theme';
import { buildClinicMapHtml, type ClinicMapProps } from './clinicMapHtml';

/** Interactive Leaflet/OpenStreetMap clinic map (web: sandboxed iframe). */
export function ClinicMap({ clinics, selectedId, onSelect, height = 300 }: ClinicMapProps) {
  const frame = useRef<HTMLIFrameElement | null>(null);
  const html = useMemo(() => buildClinicMapHtml(clinics), [clinics]);

  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (e.source !== frame.current?.contentWindow) return;
      try {
        const d = typeof e.data === 'string' ? JSON.parse(e.data) : e.data;
        if (d?.type === 'select') onSelect?.(d.id);
      } catch { /* ignore */ }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [onSelect]);

  useEffect(() => {
    if (selectedId) frame.current?.contentWindow?.postMessage(JSON.stringify({ type: 'focus', id: selectedId }), '*');
  }, [selectedId]);

  return (
    <View style={{ height, borderRadius: radius.lg, overflow: 'hidden', backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.border }}>
      {React.createElement('iframe', {
        ref: frame,
        title: 'Map of BeVital clinics',
        srcDoc: html,
        sandbox: 'allow-scripts allow-popups allow-popups-to-escape-sandbox',
        style: { border: 0, width: '100%', height: '100%' },
        loading: 'lazy',
      })}
    </View>
  );
}
