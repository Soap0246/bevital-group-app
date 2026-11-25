import React, { useEffect, useMemo, useRef } from 'react';
import { Linking, StyleSheet, View } from 'react-native';
import { WebView as RNWebView } from 'react-native-webview';
import { colors, radius } from '@/theme';
import { buildClinicMapHtml, type ClinicMapProps } from './clinicMapHtml';

// react-native-webview's published typings don't resolve against React 19; the runtime API is stable.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const WebView = RNWebView as unknown as React.ComponentType<any>;
type WebViewHandle = { injectJavaScript: (js: string) => void };

/** Interactive Leaflet/OpenStreetMap clinic map (native: WebView). */
export function ClinicMap({ clinics, selectedId, onSelect, height = 300 }: ClinicMapProps) {
  const ref = useRef<WebViewHandle>(null);
  // Rebuild the page only when the clinic list changes, never on selection (that would reload the map).
  const html = useMemo(() => buildClinicMapHtml(clinics), [clinics]);

  useEffect(() => {
    if (selectedId) ref.current?.injectJavaScript(`window.focusClinic && window.focusClinic(${JSON.stringify(selectedId)}); true;`);
  }, [selectedId]);

  const onMessage = (e: { nativeEvent: { data: string } }) => {
    try {
      const d = JSON.parse(e.nativeEvent.data) as { type: string; id: string };
      if (d.type === 'select') onSelect?.(d.id);
    } catch { /* ignore */ }
  };

  return (
    <View style={[styles.wrap, { height }]} accessibilityLabel="Map of BeVital clinics">
      <WebView
        ref={ref}
        originWhitelist={['*']}
        source={{ html, baseUrl: 'https://bevital.local' }}
        onMessage={onMessage}
        javaScriptEnabled
        domStorageEnabled
        setSupportMultipleWindows={false}
        onShouldStartLoadWithRequest={(req: { url: string }) => {
          if (/^(https:\/\/(www\.)?google\.com\/maps|tel:)/.test(req.url)) { void Linking.openURL(req.url); return false; }
          return true;
        }}
        style={{ backgroundColor: colors.surfaceAlt }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { borderRadius: radius.lg, overflow: 'hidden', backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.border },
});
