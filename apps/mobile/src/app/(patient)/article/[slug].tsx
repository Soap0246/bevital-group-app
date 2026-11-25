import React from 'react';
import { useLocalSearchParams } from 'expo-router';
import { useArticles } from '@/api/catalog';
import { Badge, EmptyState, LoadingList, Screen, Text } from '@/components/ui';

export default function Article() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const articles = useArticles();
  const a = (articles.data ?? []).find((x) => x.slug === slug);
  if (articles.isLoading) return <Screen title="Health tip"><LoadingList count={1} /></Screen>;
  if (!a) return <Screen title="Health tip"><EmptyState title="Article not found" /></Screen>;
  return (
    <Screen title="Health tip">
      <Badge label={a.category ?? 'Health tip'} tone="primary" />
      <Text variant="display" style={{ marginVertical: 12 }}>{a.title}</Text>
      <Text variant="caption" color="textMuted" style={{ marginBottom: 12 }}>{a.reading_minutes} min read</Text>
      <Text color="inkSoft">{a.body}</Text>
    </Screen>
  );
}
