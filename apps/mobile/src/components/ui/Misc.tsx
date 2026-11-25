import React from 'react';
import { Image } from 'expo-image';
import { Pressable, ScrollView, StyleSheet, TextInput, View, type StyleProp, type ViewStyle } from 'react-native';
import { BOOKING_STATUS_META, initials, type BookingStatus, type StatusTone } from '@bevital/shared';
import { colors, fontFamily, radius, toneColors, TOUCH_TARGET } from '@/theme';
import { branding, type LogoVariant } from '@/config/branding';
import { Text } from './Text';
import { Icon, type IconName } from './Icon';

// ───────────────────────── Logo ─────────────────────────
/**
 * Renders one of the two official logos from the central branding config. It never redraws a logo:
 * until the real artwork is dropped into assets/brand and `isPlaceholder` is switched off it shows a
 * clearly-labelled dashed frame.
 */
export function Logo({ variant, height = 40, style }: { variant: LogoVariant; height?: number; style?: StyleProp<ViewStyle> }) {
  const cfg = branding.logos[variant];
  const width = Math.round(height * cfg.aspectRatio);
  if (cfg.isPlaceholder) {
    return (
      <View
        accessible
        accessibilityLabel={cfg.accessibilityLabel}
        style={[{ width, height, borderRadius: 10, borderWidth: 1.5, borderStyle: 'dashed', borderColor: colors.borderStrong, alignItems: 'center', justifyContent: 'center' }, style]}
      >
        <Text variant="label" color="textSubtle" style={{ fontSize: Math.max(9, height * 0.2), lineHeight: Math.max(12, height * 0.26) }}>
          {variant === 'main' ? 'LOGO A (placeholder)' : 'LOGO B (placeholder)'}
        </Text>
      </View>
    );
  }
  return <Image source={cfg.source} style={[{ width, height }, style as object]} contentFit="contain" accessibilityLabel={cfg.accessibilityLabel} />;
}

// ───────────────────────── Badge / status ─────────────────────────
export function Badge({ label, tone = 'neutral', icon }: { label: string; tone?: StatusTone; icon?: IconName }) {
  const t = toneColors[tone];
  return (
    <View style={[styles.badge, { backgroundColor: t.bg }]} accessible accessibilityLabel={label}>
      {icon ? <Icon name={icon} size={13} color={tone === 'neutral' ? 'textMuted' : (tone === 'primary' ? 'primaryDark' : tone)} /> : null}
      <Text variant="label" style={{ color: t.fg }}>{label}</Text>
    </View>
  );
}

export function StatusBadge({ status }: { status: BookingStatus }) {
  const m = BOOKING_STATUS_META[status];
  return <Badge label={m.label} tone={m.tone} />;
}

// ───────────────────────── Avatar / Rating ─────────────────────────
export function Avatar({ name, uri, size = 48 }: { name: string; uri?: string | null; size?: number }) {
  if (uri) return <Image source={{ uri }} style={{ width: size, height: size, borderRadius: size / 2 }} accessibilityLabel={name} />;
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: colors.primaryLight, alignItems: 'center', justifyContent: 'center' }} accessible accessibilityLabel={name}>
      <Text variant="bodyStrong" color="primaryDark" style={{ fontSize: size * 0.36 }}>{initials(name) || '?'}</Text>
    </View>
  );
}

export function Rating({ value, count, size = 14 }: { value: number; count?: number; size?: number }) {
  if (!count) return null;
  return (
    <View style={styles.rating} accessible accessibilityLabel={`Rated ${value.toFixed(1)} out of 5 from ${count} reviews`}>
      <Icon name="star" size={size} color="accent" />
      <Text variant="caption" color="ink" style={{ fontFamily: fontFamily.semibold }}>{Number(value).toFixed(1)}</Text>
      <Text variant="caption" color="textMuted">({count})</Text>
    </View>
  );
}

/** 1–5 star picker */
export function StarPicker({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  return (
    <View style={{ flexDirection: 'row', gap: 6 }} accessibilityRole="adjustable" accessibilityLabel={`Rating ${value} of 5`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Pressable key={n} onPress={() => onChange(n)} hitSlop={6} accessibilityRole="button" accessibilityLabel={`${n} star${n > 1 ? 's' : ''}`} style={{ padding: 4 }}>
          <Icon name={n <= value ? 'star' : 'star-outline'} size={36} color="accent" />
        </Pressable>
      ))}
    </View>
  );
}

// ───────────────────────── Chips / segmented ─────────────────────────
export function Chip({ label, selected, onPress, icon }: { label: string; selected?: boolean; onPress?: () => void; icon?: IconName }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected }}
      accessibilityLabel={label}
      onPress={onPress}
      style={[styles.chip, selected && styles.chipOn]}
    >
      {icon ? <Icon name={icon} size={16} color={selected ? 'surface' : 'textMuted'} /> : null}
      <Text variant="caption" style={{ fontFamily: fontFamily.semibold }} color={selected ? 'surface' : 'inkSoft'}>{label}</Text>
    </Pressable>
  );
}

export function ChipRow({ children }: { children: React.ReactNode }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingHorizontal: 20 }} style={{ marginHorizontal: -20 }}>
      {children}
    </ScrollView>
  );
}

/** Horizontally scrolling row of cards, bleeding to the screen edges. */
export function ScrollRow({ children }: { children: React.ReactNode }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12, paddingHorizontal: 20 }} style={{ marginHorizontal: -20 }}>
      {children}
    </ScrollView>
  );
}

export function Segmented<T extends string>({ options, value, onChange }: { options: Array<{ value: T; label: string; icon?: IconName }>; value: T; onChange: (v: T) => void }) {
  return (
    <View style={styles.segmented} accessibilityRole="tablist">
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable key={o.value} accessibilityRole="tab" accessibilityState={{ selected: on }} onPress={() => onChange(o.value)} style={[styles.segment, on && styles.segmentOn]}>
            {o.icon ? <Icon name={o.icon} size={18} color={on ? 'primaryDark' : 'textMuted'} /> : null}
            <Text variant="bodyStrong" color={on ? 'primaryDark' : 'textMuted'} style={{ fontSize: 15 }}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// ───────────────────────── Search ─────────────────────────
export function SearchBar({ value, onChangeText, placeholder = 'Search services or conditions', onSubmit }: { value: string; onChangeText: (t: string) => void; placeholder?: string; onSubmit?: () => void }) {
  return (
    <View style={styles.search}>
      <Icon name="search" size={20} color="textMuted" />
      <TextInput
        accessibilityLabel="Search"
        value={value}
        onChangeText={onChangeText}
        onSubmitEditing={onSubmit}
        placeholder={placeholder}
        placeholderTextColor={colors.textSubtle}
        returnKeyType="search"
        style={styles.searchInput}
      />
      {value ? (
        <Pressable accessibilityRole="button" accessibilityLabel="Clear search" onPress={() => onChangeText('')} hitSlop={10}>
          <Icon name="close-circle" size={20} color="textSubtle" />
        </Pressable>
      ) : null}
    </View>
  );
}

// ───────────────────────── Layout bits ─────────────────────────
export function SectionHeader({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) {
  return (
    <View style={styles.sectionHeader}>
      <Text variant="heading" accessibilityRole="header">{title}</Text>
      {action ? (
        <Pressable onPress={onAction} accessibilityRole="button" hitSlop={10}>
          <Text variant="bodyStrong" color="primary">{action}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function Divider({ style }: { style?: StyleProp<ViewStyle> }) {
  return <View style={[{ height: 1, backgroundColor: colors.border }, style]} />;
}

export function Row({ icon, title, subtitle, right, onPress, danger, last }: { icon?: IconName; title: string; subtitle?: string; right?: React.ReactNode; onPress?: () => void; danger?: boolean; last?: boolean }) {
  const content = (
    <View style={[styles.row, !last && styles.rowBorder]}>
      {icon ? (
        <View style={[styles.rowIcon, danger && { backgroundColor: colors.dangerLight }]}>
          <Icon name={icon} size={20} color={danger ? 'danger' : 'primary'} />
        </View>
      ) : null}
      <View style={{ flex: 1 }}>
        <Text variant="bodyStrong" color={danger ? 'danger' : 'text'}>{title}</Text>
        {subtitle ? <Text variant="caption" color="textMuted">{subtitle}</Text> : null}
      </View>
      {right ?? (onPress ? <Icon name="chevron-forward" size={20} color="textSubtle" /> : null)}
    </View>
  );
  return onPress ? (
    <Pressable accessibilityRole="button" accessibilityLabel={title} onPress={onPress} style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}>{content}</Pressable>
  ) : content;
}

export function Banner({ tone = 'info', icon, title, body }: { tone?: StatusTone; icon?: IconName; title: string; body?: string }) {
  const t = toneColors[tone];
  return (
    <View style={[styles.banner, { backgroundColor: t.bg }]} accessibilityRole="alert">
      {icon ? <Icon name={icon} size={22} color={tone === 'neutral' ? 'textMuted' : (tone === 'primary' ? 'primaryDark' : tone)} /> : null}
      <View style={{ flex: 1 }}>
        <Text variant="bodyStrong" style={{ color: t.fg }}>{title}</Text>
        {body ? <Text variant="caption" color="inkSoft">{body}</Text> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill, alignSelf: 'flex-start' },
  rating: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44, paddingHorizontal: 16, borderRadius: radius.pill, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  chipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  segmented: { flexDirection: 'row', backgroundColor: colors.primaryLight, borderRadius: radius.md, padding: 4, gap: 4 },
  segment: { flex: 1, flexDirection: 'row', gap: 6, minHeight: 46, alignItems: 'center', justifyContent: 'center', borderRadius: radius.sm },
  segmentOn: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  search: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: TOUCH_TARGET, paddingHorizontal: 16, borderRadius: radius.pill, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  searchInput: { flex: 1, fontFamily: fontFamily.regular, fontSize: 16, color: colors.text, paddingVertical: 10 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 28, marginBottom: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 64, paddingVertical: 10 },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: colors.border },
  rowIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: colors.primaryLight, alignItems: 'center', justifyContent: 'center' },
  banner: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, padding: 14, borderRadius: radius.md },
});
