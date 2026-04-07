import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  SafeAreaView,
} from 'react-native';
import { Plus, Droplet, Thermometer, Sun, Wind } from 'lucide-react-native';
import { colors, spacing, fontSizes } from '../constants/theme';
import { mockPlants, Plant } from '../data/mockPlants';

function StatusBadge({ status }: { status: Plant['status'] }) {
  const isHealthy = status === 'healthy';
  return (
    <View
      style={[
        styles.badge,
        { backgroundColor: isHealthy ? colors.healthyBg : colors.warningBg },
      ]}
    >
      <View
        style={[
          styles.badgeDot,
          { backgroundColor: isHealthy ? colors.healthy : colors.warning },
        ]}
      />
      <Text
        style={[
          styles.badgeText,
          { color: isHealthy ? colors.healthy : colors.warning },
        ]}
      >
        {isHealthy ? 'Healthy' : 'Needs Attention'}
      </Text>
    </View>
  );
}

function MetricBlock({
  Icon,
  value,
  label,
}: {
  Icon: any;
  value: string;
  label: string;
}) {
  return (
    <View style={styles.metric}>
      <Icon size={18} color={colors.textSecondary} strokeWidth={1.75} />
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  );
}

function PlantCard({
  plant,
  onPress,
}: {
  plant: Plant;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={styles.card}
      onPress={onPress}
      activeOpacity={0.85}
    >
      <View style={styles.cardHeader}>
        <View style={{ flex: 1 }}>
          <Text style={styles.plantName}>{plant.name}</Text>
          <Text style={styles.plantSpecies}>{plant.species}</Text>
        </View>
        <StatusBadge status={plant.status} />
      </View>

      <View style={styles.metricsRow}>
        <MetricBlock Icon={Droplet} value={`${plant.moisture}%`} label="Moisture" />
        <MetricBlock Icon={Thermometer} value={`${plant.temperature}°C`} label="Temp" />
        <MetricBlock Icon={Sun} value={`${plant.light} lx`} label="Light" />
        <MetricBlock Icon={Wind} value={`${plant.humidity}%`} label="Humidity" />
      </View>

      <Text style={styles.lastUpdated}>Last updated: {plant.lastUpdated}</Text>
    </TouchableOpacity>
  );
}

export default function HomeScreen({ navigation }: any) {
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>My Plants</Text>
        <TouchableOpacity style={styles.addButton} activeOpacity={0.85}>
          <Plus size={18} color={colors.surface} strokeWidth={2.5} />
          <Text style={styles.addButtonText}>Add Plant</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {mockPlants.map((plant) => (
          <PlantCard
            key={plant.id}
            plant={plant}
            onPress={() =>
              navigation.navigate('PlantDetail', { plantId: plant.id })
            }
          />
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
  },
  title: {
    fontSize: fontSizes.xxl,
    fontWeight: '700',
    color: colors.text,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    borderRadius: 24,
    gap: spacing.xs,
  },
  addButtonText: {
    color: colors.surface,
    fontSize: fontSizes.sm,
    fontWeight: '600',
  },
  scrollContent: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
    gap: spacing.md,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: spacing.md,
  },
  plantName: {
    fontSize: fontSizes.lg,
    fontWeight: '700',
    color: colors.text,
  },
  plantSpecies: {
    fontSize: fontSizes.sm,
    color: colors.textSecondary,
    marginTop: 2,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 5,
    borderRadius: 12,
    gap: 5,
  },
  badgeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  badgeText: {
    fontSize: fontSizes.xs,
    fontWeight: '600',
  },
  metricsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  metric: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
  },
  metricValue: {
    fontSize: fontSizes.md,
    fontWeight: '700',
    color: colors.text,
    marginTop: 2,
  },
  metricLabel: {
    fontSize: fontSizes.xs,
    color: colors.textSecondary,
  },
  lastUpdated: {
    fontSize: fontSizes.xs,
    color: colors.textSecondary,
    textAlign: 'right',
    marginTop: spacing.xs,
  },
});
