import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  SafeAreaView,
} from 'react-native';
import {
  ArrowLeft,
  Droplet,
  Sun,
  Thermometer,
  Wind,
} from 'lucide-react-native';
import { LineChart } from 'react-native-gifted-charts';
import { colors, spacing, fontSizes } from '../constants/theme';
import { mockPlants } from '../data/mockPlants';

type MetricColor = 'moisture' | 'light' | 'temperature' | 'humidity';

const metricColorMap: Record<MetricColor, string> = {
  moisture: colors.moisture,
  light: colors.light,
  temperature: colors.temperature,
  humidity: colors.humidity,
};

function MetricCard({
  Icon,
  label,
  value,
  accent,
  fillPercent,
}: {
  Icon: any;
  label: string;
  value: string;
  accent: MetricColor;
  fillPercent: number;
}) {
  const color = metricColorMap[accent];
  return (
    <View style={styles.metricCard}>
      <Icon size={22} color={colors.text} strokeWidth={1.75} />
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={[styles.metricValue, { color }]}>{value}</Text>
      <View style={styles.progressTrack}>
        <View
          style={[
            styles.progressFill,
            { width: `${fillPercent}%`, backgroundColor: color },
          ]}
        />
      </View>
      <Text style={styles.inRange}>In range</Text>
    </View>
  );
}

const moistureTrend = [
  { value: 65 },
  { value: 58 },
  { value: 55 },
  { value: 52 },
  { value: 50 },
  { value: 48 },
  { value: 45 },
  { value: 55 },
  { value: 58 },
  { value: 52 },
  { value: 48 },
  { value: 45 },
  { value: 42 },
  { value: 40 },
];

export default function PlantDetailScreen({ route, navigation }: any) {
  const plantId = route?.params?.plantId ?? '1';
  const plant = mockPlants.find((p) => p.id === plantId) ?? mockPlants[0];

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.topBar}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backButton}
          activeOpacity={0.7}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <ArrowLeft size={24} color={colors.text} strokeWidth={2} />
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.title}>{plant.name}</Text>
        <Text style={styles.subtitle}>
          {plant.species} · Last updated {plant.lastUpdated}
        </Text>

        <View style={styles.grid}>
          <MetricCard
            Icon={Droplet}
            label="Moisture"
            value={`${plant.moisture}%`}
            accent="moisture"
            fillPercent={plant.moisture}
          />
          <MetricCard
            Icon={Sun}
            label="Light"
            value={`${plant.light} lx`}
            accent="light"
            fillPercent={Math.min((plant.light / 1000) * 100, 100)}
          />
          <MetricCard
            Icon={Thermometer}
            label="Temperature"
            value={`${plant.temperature}°C`}
            accent="temperature"
            fillPercent={Math.min((plant.temperature / 40) * 100, 100)}
          />
          <MetricCard
            Icon={Wind}
            label="Humidity"
            value={`${plant.humidity}%`}
            accent="humidity"
            fillPercent={plant.humidity}
          />
        </View>

        <View style={styles.chartCard}>
          <Text style={styles.chartTitle}>Moisture Trend (24h)</Text>
          <LineChart
            data={moistureTrend}
            areaChart
            curved
            color={colors.moisture}
            startFillColor={colors.moisture}
            endFillColor={colors.moisture}
            startOpacity={0.3}
            endOpacity={0.05}
            thickness={2}
            hideDataPoints={false}
            dataPointsColor={colors.moisture}
            dataPointsRadius={3}
            yAxisColor="transparent"
            xAxisColor="transparent"
            yAxisTextStyle={{ color: colors.textSecondary, fontSize: 10 }}
            noOfSections={4}
            maxValue={100}
            initialSpacing={10}
            spacing={22}
            rulesColor={colors.divider}
            rulesType="dashed"
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  topBar: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollContent: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
  },
  title: {
    fontSize: fontSizes.xxl,
    fontWeight: '700',
    color: colors.text,
  },
  subtitle: {
    fontSize: fontSizes.sm,
    color: colors.textSecondary,
    marginTop: 2,
    marginBottom: spacing.md,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  metricCard: {
    flexBasis: '47%',
    flexGrow: 1,
    backgroundColor: colors.surface,
    borderRadius: 14,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
  },
  metricLabel: {
    fontSize: fontSizes.sm,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  metricValue: {
    fontSize: fontSizes.lg,
    fontWeight: '700',
    marginTop: 2,
    marginBottom: spacing.sm,
  },
  progressTrack: {
    width: '100%',
    height: 5,
    backgroundColor: colors.divider,
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 3,
  },
  inRange: {
    fontSize: fontSizes.xs,
    fontWeight: '600',
    color: colors.healthy,
    marginTop: spacing.xs,
  },
  chartCard: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chartTitle: {
    fontSize: fontSizes.md,
    fontWeight: '700',
    color: colors.text,
    marginBottom: spacing.sm,
  },
});
