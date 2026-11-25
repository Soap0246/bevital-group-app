import React from 'react';
import { View } from 'react-native';
import { BRAND } from '@bevital/shared';
import { Banner, Card, Icon, Screen, Text, type IconName } from '@/components/ui';

const ITEMS: Array<{ icon: IconName; title: string; body: string }> = [
  { icon: 'lock-closed-outline', title: 'Your health profile is private', body: 'Medical history, allergies, documents and notes are stored in a protected area that only you can read. BeVital administrators cannot browse it.' },
  { icon: 'person-outline', title: 'Physiotherapists see only what you share', body: 'A physiotherapist can open your health profile only for an appointment where you switched sharing on — and you can switch it off at any time from the booking page. Each access is recorded in an audit log.' },
  { icon: 'people-outline', title: 'Family profiles', body: 'Information about family members is held in your account and shared on the same terms. Consent is recorded when you add them.' },
  { icon: 'location-outline', title: 'Location', body: 'Your address is shared with your physiotherapist for confirmed home visits. Your physiotherapist\'s live location is shared with you only while they are on the way, and only from their phone\'s real GPS.' },
  { icon: 'card-outline', title: 'Payments', body: 'Card and banking details are handled by our payment partner and never stored by BeVital.' },
  { icon: 'document-text-outline', title: 'Your rights under the PDPA', body: `You may ask to access, correct or withdraw consent for your personal data at any time. Contact ${BRAND.supportEmail}.` },
];

export default function Privacy() {
  return (
    <Screen title="Privacy & data access">
      <Banner tone="warning" icon="information-circle-outline" title="Draft wording" body="This summary must be reviewed by BeVital's legal counsel against the Personal Data Protection Act 2010 (Malaysia) before launch." />
      <View style={{ gap: 12, marginTop: 16 }}>
        {ITEMS.map((i) => (
          <Card key={i.title}>
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <Icon name={i.icon} size={24} color="primary" />
              <View style={{ flex: 1, gap: 4 }}><Text variant="subheading">{i.title}</Text><Text color="inkSoft">{i.body}</Text></View>
            </View>
          </Card>
        ))}
      </View>
    </Screen>
  );
}
