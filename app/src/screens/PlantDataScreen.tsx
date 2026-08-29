import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Droplets, Sun, Thermometer, Wind } from 'lucide-react-native';
import React, { useCallback, useState } from 'react';
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { LineChart } from 'react-native-gifted-charts';

import { getLatestReading, getPlant, getReadingHistory } from '../api/client';
import { MetricGauge } from '../components/MetricGauge';
import { ErrorState } from '../components/ui';
import { relativeTime } from '../constants/helpers';
import { theme } from '../constants/theme';
import { usePolling } from '../hooks/usePolling';
import type { HomeStackParamList, Plant, Reading } from '../types';

type Props = NativeStackScreenProps<HomeStackParamList, 'PlantData'>;

const WINDOWS = {
  '24h': 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
  '30d': 30 * 24 * 60 * 60 * 1000,
} as const;
type WindowKey = keyof typeof WINDOWS;

const METRICS = [
  { key: 'moisture', label: 'Moisture', unit: '%', digits: 0, color: theme.colors.metric.moisture },
  { key: 'temp_c', label: 'Temperature', unit: '°C', digits: 1, color: theme.colors.metric.temp },
  { key: 'humidity', label: 'Humidity', unit: '%', digits: 0, color: theme.colors.metric.humidity },
  { key: 'lux', label: 'Light', unit: 'lx', digits: 0, color: theme.colors.metric.lux },
] as const;
type MetricKey = (typeof METRICS)[number]['key'];

/** Keep charts responsive by thinning dense ranges to ~120 points. */
function downsample(readings: Reading[], maxPoints = 120): Reading[] {
  if (readings.length <= maxPoints) return readings;
  const step = Math.ceil(readings.length / maxPoints);
  return readings.filter((_, i) => i % step === 0);
}

/**
 * Plant Data (mockup): large plant title, 2x2 gauge grid with identity
 * colors + range pills, and a chart card with metric pills above the
 * "«Metric» Trend («window»)" title, then window pills. Data logic
 * unchanged: /plants/:id, latest reading, /sensors/:deviceId/history.
 */
export function PlantDataScreen({ route }: Props) {
  const { plantId, deviceId } = route.params;
  const { width } = useWindowDimensions();

  const [plant, setPlant] = useState<Plant | null>(null);
  const [latest, setLatest] = useState<Reading | null>(null);
  const [history, setHistory] = useState<Reading[]>([]);
  const [window, setWindow] = useState<WindowKey>('24h');
  const [metric, setMetric] = useState<MetricKey>('moisture');
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [plantData, latestReading, historyData] = await Promise.all([
        getPlant(plantId),
        getLatestReading(deviceId).catch(() => null),
        getReadingHistory(deviceId, new Date(Date.now() - WINDOWS[window]), new Date()),
      ]);
      setPlant(plantData);
      setLatest(latestReading ?? plantData.latest_reading ?? null);
      setHistory(historyData);
      setError(null);
    } catch (err) {
      console.warn('Failed to load plant data', err);
      // Without this the screen renders a nameless plant with "No readings
      // yet", which reads as "your pot is idle" rather than "we failed".
      setError(err instanceof Error ? err.message : 'Please try again.');
    }
  }, [plantId, deviceId, window]);

  usePolling(load);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const species = plant?.species ?? null;
  const ranges: Record<MetricKey, [number | null, number | null]> = {
    moisture: [species?.ideal_moisture_min ?? null, species?.ideal_moisture_max ?? null],
    temp_c: [species?.ideal_temp_min ?? null, species?.ideal_temp_max ?? null],
    humidity: [species?.ideal_humidity_min ?? null, species?.ideal_humidity_max ?? null],
    lux: [species?.ideal_lux_min ?? null, species?.ideal_lux_max ?? null],
  };
  const icons: Record<MetricKey, React.ReactNode> = {
    moisture: <Droplets size={16} color={theme.colors.metric.moisture} />,
    temp_c: <Thermometer size={16} color={theme.colors.metric.temp} />,
    humidity: <Wind size={16} color={theme.colors.metric.humidity} />,
    lux: <Sun size={16} color={theme.colors.metric.lux} />,
  };

  const chartData = downsample(history).map((r) => ({ value: r[metric] ?? 0 }));
  const selectedMetric = METRICS.find((m) => m.key === metric) ?? METRICS[0];

  return (
    <ScrollView
      style={styles.flex}
      contentContainerStyle={styles.container}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor={theme.colors.primary}
          colors={[theme.colors.primary]}
        />
      }
    >
      {error && !plant ? (
        <ErrorState
          title="Can't load this plant"
          message={error}
          onRetry={onRefresh}
          retrying={refreshing}
        />
      ) : (
        <>
      <View>
        <Text style={styles.title}>{plant?.nickname || 'Plant'}</Text>
        <Text style={styles.subtitle}>
          {species?.common_name ? `${species.common_name} · ` : ''}
          {latest ? `Last updated ${relativeTime(latest.ts)}` : 'No readings yet'}
        </Text>
      </View>

      <View style={styles.gauges}>
        {METRICS.map((m) => (
          <MetricGauge
            key={m.key}
            label={m.label}
            value={latest ? latest[m.key] : null}
            unit={m.unit}
            digits={m.digits}
            min={ranges[m.key][0]}
            max={ranges[m.key][1]}
            icon={icons[m.key]}
            color={m.color}
          />
        ))}
      </View>

      <View style={styles.chartCard}>
        <View style={styles.chipRow}>
          {METRICS.map((m) => (
            <Pressable
              key={m.key}
              onPress={() => setMetric(m.key)}
              accessibilityRole="button"
              style={[styles.chip, metric === m.key && styles.chipActive]}
            >
              <Text style={[styles.chipText, metric === m.key && styles.chipTextActive]}>
                {m.label}
              </Text>
            </Pressable>
          ))}
        </View>

        <Text style={styles.chartTitle}>
          {selectedMetric.label} Trend ({window})
        </Text>

        <View style={styles.chipRow}>
          {(Object.keys(WINDOWS) as WindowKey[]).map((w) => (
            <Pressable
              key={w}
              onPress={() => setWindow(w)}
              accessibilityRole="button"
              style={[styles.chip, window === w && styles.chipActive]}
            >
              <Text style={[styles.chipText, window === w && styles.chipTextActive]}>{w}</Text>
            </Pressable>
          ))}
        </View>

        {chartData.length > 1 ? (
          <LineChart
            data={chartData}
            width={width - theme.spacing.md * 2 - theme.spacing.lg * 2}
            height={200}
            adjustToWidth
            thickness={2}
            color={selectedMetric.color}
            hideDataPoints
            curved
            areaChart
            startFillColor={selectedMetric.color}
            endFillColor={theme.colors.surface}
            startOpacity={0.25}
            endOpacity={0.02}
            yAxisTextStyle={{ color: theme.colors.textSecondary, fontSize: theme.fontSize.xs }}
            yAxisColor={theme.colors.border}
            xAxisColor={theme.colors.border}
            rulesColor={theme.colors.border}
            noOfSections={4}
            initialSpacing={0}
          />
        ) : (
          <View style={styles.noData}>
            <Text style={styles.noDataText}>
              Not enough data for this window yet. Readings arrive every 15 minutes.
            </Text>
          </View>
        )}
      </View>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  container: {
    padding: theme.spacing.md,
    paddingTop: 0,
    gap: theme.spacing.md,
  },
  title: {
    fontSize: theme.fontSize.xl + 2,
    fontWeight: '800',
    color: theme.colors.text,
  },
  subtitle: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.textSecondary,
    marginTop: theme.spacing.xs,
  },
  gauges: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.sm + theme.spacing.xs,
  },
  chartCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: theme.spacing.lg,
    gap: theme.spacing.md,
    ...theme.shadow.card,
  },
  chartTitle: {
    fontSize: theme.fontSize.lg,
    fontWeight: '700',
    color: theme.colors.text,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
  },
  chip: {
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingHorizontal: theme.spacing.md,
    minHeight: 34,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.surface,
  },
  chipActive: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
  },
  chipText: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.textSecondary,
    fontWeight: '600',
  },
  chipTextActive: {
    color: '#FFFFFF',
  },
  noData: {
    paddingVertical: theme.spacing.xl,
    alignItems: 'center',
  },
  noDataText: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.textSecondary,
    textAlign: 'center',
  },
});
