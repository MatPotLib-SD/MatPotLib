import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { RangePill } from './ui';
import { formatMetric, inRange } from '../constants/helpers';
import { theme } from '../constants/theme';

interface MetricGaugeProps {
  label: string;
  value: number | null | undefined;
  unit: string;
  min: number | null | undefined;
  max: number | null | undefined;
  icon: React.ReactNode;
  /** Metric identity color for the value (mockup gauges). */
  color: string;
  /** Decimal places for the value. */
  digits?: number;
}

/**
 * Gauge card for one metric (mockup Plant Data): centered icon + label,
 * large value in the metric's identity color, and an in/out-of-range pill
 * derived from the species' ideal range.
 */
export function MetricGauge({
  label,
  value,
  unit,
  min,
  max,
  icon,
  color,
  digits = 0,
}: MetricGaugeProps) {
  const ok = inRange(value, min, max);

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        {icon}
        <Text style={styles.label}>{label}</Text>
      </View>
      <Text style={[styles.value, { color }]}>
        {formatMetric(value, digits)}
        <Text style={[styles.unit, { color }]}> {unit}</Text>
      </Text>
      <RangePill ok={ok} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: theme.spacing.md,
    flex: 1,
    minWidth: '45%',
    gap: theme.spacing.sm,
    alignItems: 'center',
    ...theme.shadow.card,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs + 2,
  },
  label: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.textSecondary,
    fontWeight: '600',
  },
  value: {
    fontSize: theme.fontSize.xl + 2,
    fontWeight: '800',
  },
  unit: {
    fontSize: theme.fontSize.sm,
    fontWeight: '600',
  },
});
