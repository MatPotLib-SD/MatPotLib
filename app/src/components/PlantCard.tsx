import { Droplets, Sun, Thermometer, Wind } from 'lucide-react-native';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { StatusChip } from './ui';
import { deriveHealth, formatMetric, relativeTime } from '../constants/helpers';
import { theme } from '../constants/theme';
import type { Plant } from '../types';

interface PlantCardProps {
  plant: Plant;
  onPress: () => void;
}

/**
 * Home screen card (mockup "My Plants"): nickname + species, health chip,
 * four metric columns (icon + value over label), last-updated line.
 */
export function PlantCard({ plant, onPress }: PlantCardProps) {
  const reading = plant.latest_reading ?? null;
  const species = plant.species ?? null;
  const health = deriveHealth(reading, species);

  const metrics = [
    {
      icon: <Droplets size={14} color={theme.colors.metric.moisture} />,
      value: `${formatMetric(reading?.moisture)}%`,
      label: 'Moisture',
    },
    {
      icon: <Thermometer size={14} color={theme.colors.metric.temp} />,
      value: `${formatMetric(reading?.temp_c, 1)}°C`,
      label: 'Temp',
    },
    {
      icon: <Sun size={14} color={theme.colors.metric.lux} />,
      value: `${formatMetric(reading?.lux)} lx`,
      label: 'Light',
    },
    {
      icon: <Wind size={14} color={theme.colors.metric.humidity} />,
      value: `${formatMetric(reading?.humidity)}%`,
      label: 'Humidity',
    },
  ];

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel={`Plant ${plant.nickname ?? 'Unnamed'}`}
    >
      <View style={styles.topRow}>
        <View style={styles.titleWrap}>
          <Text style={styles.nickname} numberOfLines={1}>
            {plant.nickname || 'Unnamed plant'}
          </Text>
          {species?.common_name ? (
            <Text style={styles.species} numberOfLines={1}>
              {species.common_name}
            </Text>
          ) : null}
        </View>
        <StatusChip status={health} />
      </View>

      <View style={styles.metricsRow}>
        {metrics.map((m) => (
          <View key={m.label} style={styles.metric}>
            <View style={styles.metricValueRow}>
              {m.icon}
              <Text style={styles.metricValue}>{m.value}</Text>
            </View>
            <Text style={styles.metricLabel}>{m.label}</Text>
          </View>
        ))}
      </View>

      <Text style={styles.updated}>
        {reading ? `Last updated: ${relativeTime(reading.ts)}` : 'No readings yet'}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.md,
    marginHorizontal: theme.spacing.md,
    marginBottom: theme.spacing.sm + theme.spacing.xs,
    gap: theme.spacing.md,
    minHeight: theme.touchTarget,
    borderWidth: 1,
    borderColor: theme.colors.border,
    ...theme.shadow.card,
  },
  pressed: {
    opacity: 0.8,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: theme.spacing.sm,
  },
  titleWrap: {
    flex: 1,
  },
  nickname: {
    fontSize: theme.fontSize.lg,
    fontWeight: '700',
    color: theme.colors.text,
  },
  species: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.textSecondary,
    marginTop: 2,
  },
  metricsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  metric: {
    alignItems: 'center',
    gap: 2,
    flex: 1,
  },
  metricValueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
  },
  metricValue: {
    fontSize: theme.fontSize.sm + 1,
    color: theme.colors.text,
    fontWeight: '700',
  },
  metricLabel: {
    fontSize: theme.fontSize.xs,
    color: theme.colors.textSecondary,
  },
  updated: {
    fontSize: theme.fontSize.xs,
    color: theme.colors.textDisabled,
    textAlign: 'right',
  },
});
