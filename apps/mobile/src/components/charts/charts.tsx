import React from 'react';
import { View } from 'react-native';
import Svg, { Circle, G, Line, Polyline, Rect, Text as SvgText } from 'react-native-svg';
import { colors, fontFamily } from '@/theme';
import { Text } from '@/components/ui';

export function ProgressRing({ value, size = 120, stroke = 12, label, sublabel }: { value: number; size?: number; stroke?: number; label?: string; sublabel?: string }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, value));
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }} accessible accessibilityLabel={`${label ?? 'Progress'} ${Math.round(pct)} percent`}>
      <Svg width={size} height={size}>
        <G rotation={-90} origin={`${size / 2}, ${size / 2}`}>
          <Circle cx={size / 2} cy={size / 2} r={r} stroke={colors.primaryLight} strokeWidth={stroke} fill="none" />
          <Circle
            cx={size / 2} cy={size / 2} r={r} stroke={colors.primary} strokeWidth={stroke} fill="none" strokeLinecap="round"
            strokeDasharray={`${c}`} strokeDashoffset={c * (1 - pct / 100)}
          />
        </G>
      </Svg>
      <View style={{ position: 'absolute', alignItems: 'center' }}>
        <Text variant="title" color="ink">{Math.round(pct)}%</Text>
        {sublabel ? <Text variant="caption" color="textMuted">{sublabel}</Text> : null}
      </View>
    </View>
  );
}

export interface Point { label: string; value: number | null }

/** Line chart for 0–10 style scores (e.g. pain before/after each session). Gaps are left unconnected. */
export function LineChart({ data, width = 300, height = 150, max = 10, color = colors.primary, ariaLabel }: { data: Point[]; width?: number; height?: number; max?: number; color?: string; ariaLabel?: string }) {
  const padL = 28, padR = 12, padT = 12, padB = 28;
  const w = width - padL - padR;
  const h = height - padT - padB;
  const x = (i: number) => padL + (data.length <= 1 ? w / 2 : (i * w) / (data.length - 1));
  const y = (v: number) => padT + h - (Math.min(v, max) / max) * h;
  const segments: Array<Array<[number, number]>> = [];
  let cur: Array<[number, number]> = [];
  data.forEach((p, i) => {
    if (p.value == null) { if (cur.length) segments.push(cur); cur = []; } else cur.push([x(i), y(p.value)]);
  });
  if (cur.length) segments.push(cur);
  return (
    <Svg width={width} height={height} accessibilityLabel={ariaLabel}>
      {[0, 0.5, 1].map((t) => (
        <G key={t}>
          <Line x1={padL} x2={width - padR} y1={padT + h - t * h} y2={padT + h - t * h} stroke={colors.border} strokeWidth={1} />
          <SvgText x={padL - 6} y={padT + h - t * h + 4} fontSize={10} fill={colors.textSubtle} textAnchor="end" fontFamily={fontFamily.regular}>{Math.round(t * max)}</SvgText>
        </G>
      ))}
      {segments.map((seg, i) => seg.length > 1 ? <Polyline key={i} points={seg.map((p) => p.join(',')).join(' ')} fill="none" stroke={color} strokeWidth={3} strokeLinejoin="round" strokeLinecap="round" /> : null)}
      {data.map((p, i) => p.value == null ? null : <Circle key={i} cx={x(i)} cy={y(p.value)} r={4.5} fill={colors.surface} stroke={color} strokeWidth={2.5} />)}
      {data.map((p, i) => (
        <SvgText key={`l${i}`} x={x(i)} y={height - 8} fontSize={10} fill={colors.textMuted} textAnchor="middle" fontFamily={fontFamily.regular}>{p.label}</SvgText>
      ))}
    </Svg>
  );
}

export function BarChart({ data, width = 300, height = 140, color = colors.primary, ariaLabel }: { data: Array<{ label: string; value: number }>; width?: number; height?: number; color?: string; ariaLabel?: string }) {
  const padB = 24, padT = 16;
  const max = Math.max(1, ...data.map((d) => d.value));
  const gap = 14;
  const bw = (width - gap * (data.length + 1)) / Math.max(1, data.length);
  const h = height - padB - padT;
  return (
    <Svg width={width} height={height} accessibilityLabel={ariaLabel}>
      {data.map((d, i) => {
        const bh = (d.value / max) * h;
        const x = gap + i * (bw + gap);
        return (
          <G key={i}>
            <Rect x={x} y={padT + h - bh} width={bw} height={Math.max(bh, d.value ? 4 : 0)} rx={6} fill={color} opacity={i === data.length - 1 ? 1 : 0.55} />
            <SvgText x={x + bw / 2} y={padT + h - bh - 5} fontSize={11} fill={colors.ink} textAnchor="middle" fontFamily={fontFamily.semibold}>{d.value}</SvgText>
            <SvgText x={x + bw / 2} y={height - 6} fontSize={10} fill={colors.textMuted} textAnchor="middle" fontFamily={fontFamily.regular}>{d.label}</SvgText>
          </G>
        );
      })}
    </Svg>
  );
}
