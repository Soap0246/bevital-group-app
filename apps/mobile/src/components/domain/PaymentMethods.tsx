import React from 'react';
import { Pressable, View } from 'react-native';
import { PAYMENT_METHOD_LABELS, type PaymentMethod } from '@bevital/shared';
import { colors } from '@/theme';
import { Icon, Text, type IconName } from '@/components/ui';

export const PAYMENT_METHOD_OPTIONS: Array<{ id: PaymentMethod; icon: IconName; hint: string }> = [
  { id: 'fpx', icon: 'business-outline', hint: 'Pay with your Malaysian online banking' },
  { id: 'duitnow_qr', icon: 'qr-code-outline', hint: 'Scan with any banking or e-wallet app' },
  { id: 'credit_card', icon: 'card-outline', hint: 'Visa, Mastercard' },
  { id: 'debit_card', icon: 'card-outline', hint: 'Visa, Mastercard debit' },
  { id: 'ewallet', icon: 'wallet-outline', hint: "Touch 'n Go, GrabPay, Boost and more" },
];

export function PaymentMethodList({ value, onChange }: { value: PaymentMethod; onChange: (m: PaymentMethod) => void }) {
  return (
    <View style={{ gap: 10 }} accessibilityRole="radiogroup">
      {PAYMENT_METHOD_OPTIONS.map((m) => {
        const on = value === m.id;
        return (
          <Pressable key={m.id} onPress={() => onChange(m.id)} accessibilityRole="radio" accessibilityState={{ selected: on }} accessibilityLabel={PAYMENT_METHOD_LABELS[m.id]}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 14, padding: 14, borderRadius: 16, borderWidth: on ? 2 : 1, borderColor: on ? colors.primary : colors.border, backgroundColor: colors.surface }}>
            <Icon name={m.icon} size={26} color="primary" />
            <View style={{ flex: 1 }}>
              <Text variant="bodyStrong">{PAYMENT_METHOD_LABELS[m.id]}</Text>
              <Text variant="caption" color="textMuted">{m.hint}</Text>
            </View>
            <Icon name={on ? 'radio-button-on' : 'radio-button-off'} size={24} color={on ? 'primary' : 'textSubtle'} />
          </Pressable>
        );
      })}
    </View>
  );
}
