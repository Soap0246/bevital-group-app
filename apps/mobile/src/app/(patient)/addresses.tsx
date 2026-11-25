import React from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { useAddresses, useDeleteAddress, useSaveAddress } from '@/api/profile';
import { Badge, Button, Card, EmptyState, Icon, LoadingList, Screen, Text, useToast } from '@/components/ui';
import { friendlyError } from '@bevital/shared';

export default function Addresses() {
  const router = useRouter();
  const toast = useToast();
  const list = useAddresses();
  const del = useDeleteAddress();
  const save = useSaveAddress();

  return (
    <Screen title="My addresses" footer={<Button label="Add new address" icon="add" onPress={() => router.push('/address/edit')} />}>
      <View style={{ gap: 12, marginTop: 8 }}>
        {list.isLoading ? <LoadingList count={2} /> : (list.data ?? []).length === 0 ? (
          <EmptyState icon="location-outline" title="No addresses yet" body="Save your home or workplace so booking a home visit takes seconds." />
        ) : (list.data ?? []).map((a) => (
          <Card key={a.id}>
            <View style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start' }}>
              <Icon name={a.label.toLowerCase() === 'work' ? 'briefcase-outline' : 'home-outline'} size={26} color="primary" />
              <View style={{ flex: 1, gap: 2 }}>
                <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}><Text variant="subheading">{a.label}</Text>{a.is_default ? <Badge label="Default" tone="primary" /> : null}</View>
                <Text color="textMuted">{[a.line1, a.line2, `${a.postcode} ${a.city}`, a.state].filter(Boolean).join(', ')}</Text>
                {a.access_notes ? <Text variant="caption" color="textSubtle">Note: {a.access_notes}</Text> : null}
              </View>
            </View>
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
              {!a.is_default ? <Button label="Make default" variant="secondary" size="md" fullWidth={false} onPress={async () => { try { await save.mutateAsync({ id: a.id, data: { ...a, is_default: true } }); } catch (e) { toast.show(friendlyError(e), 'error'); } }} /> : null}
              <Button label="Edit" variant="outline" size="md" fullWidth={false} onPress={() => router.push({ pathname: '/address/edit', params: { id: a.id } })} />
              <Button label="Delete" variant="danger" size="md" fullWidth={false} onPress={async () => { try { await del.mutateAsync(a.id); } catch (e) { toast.show(friendlyError(e), 'error'); } }} />
            </View>
          </Card>
        ))}
      </View>
    </Screen>
  );
}
