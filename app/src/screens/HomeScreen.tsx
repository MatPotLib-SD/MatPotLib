import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Plus, Sprout } from 'lucide-react-native';
import React, { useCallback, useState } from 'react';
import { Alert, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { listPlants } from '../api/client';
import { PlantCard } from '../components/PlantCard';
import { Button, ErrorState, ScreenHeader } from '../components/ui';
import { theme } from '../constants/theme';
import { usePolling } from '../hooks/usePolling';
import type { HomeStackParamList, Plant } from '../types';

type Props = NativeStackScreenProps<HomeStackParamList, 'PlantList'>;

/**
 * "My Plants" (mockup): large title + "+ Add Plant" pill, card list with
 * health chips + latest metrics. Pull-to-refresh and 60s polling while
 * focused.
 */
export function HomeScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const [plants, setPlants] = useState<Plant[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setPlants(await listPlants());
      setError(null);
    } catch (err) {
      console.warn('Failed to load plants', err);
      // Keep whatever we had. Crucially, do NOT fall back to [] — that renders
      // the "No plants yet" empty state, which is indistinguishable from a
      // backend outage. Surface the failure instead.
      setError(err instanceof Error ? err.message : 'Please try again.');
    }
  }, []);

  usePolling(load);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  function openPlant(plant: Plant) {
    if (plant.device_id) {
      navigation.navigate('PlantData', { plantId: plant.id, deviceId: plant.device_id });
    } else {
      Alert.alert(
        'No device assigned',
        'Assign your smart pot to this plant to see live data.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Edit plant',
            onPress: () => navigation.navigate('AddEditPlant', { plantId: plant.id }),
          },
        ],
      );
    }
  }

  return (
    <View style={[styles.screen, { paddingTop: insets.top + theme.spacing.sm }]}>
      <View style={styles.header}>
        <ScreenHeader
          title="My Plants"
          right={
            <Pressable
              onPress={() => navigation.navigate('AddEditPlant')}
              accessibilityRole="button"
              accessibilityLabel="Add plant"
              style={({ pressed }) => [styles.addButton, pressed && styles.pressed]}
            >
              <Plus size={16} color="#FFFFFF" strokeWidth={3} />
              <Text style={styles.addButtonText}>Add Plant</Text>
            </Pressable>
          }
        />
      </View>
      <FlatList
        style={styles.list}
        contentContainerStyle={
          error || (plants && plants.length === 0) ? styles.emptyContainer : styles.content
        }
        data={plants ?? []}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <PlantCard plant={item} onPress={() => openPlant(item)} />}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={theme.colors.primary}
            colors={[theme.colors.primary]}
          />
        }
        ListEmptyComponent={
          error ? (
            <ErrorState
              title="Can't load your plants"
              message={error}
              onRetry={onRefresh}
              retrying={refreshing}
            />
          ) : plants === null ? null : (
            <View style={styles.empty}>
              <Sprout size={64} color={theme.colors.primaryLight} strokeWidth={1.5} />
              <Text style={styles.emptyTitle}>No plants yet</Text>
              <Text style={styles.emptyText}>
                Claim your smart pot in Settings using its claim code, then add your first plant
                here.
              </Text>
              <View style={styles.emptyButton}>
                <Button title="Add a Plant" onPress={() => navigation.navigate('AddEditPlant')} />
              </View>
            </View>
          )
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  header: {
    paddingHorizontal: theme.spacing.md,
    paddingBottom: theme.spacing.sm,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
    backgroundColor: theme.colors.primary,
    borderRadius: theme.radius.pill,
    paddingHorizontal: theme.spacing.md,
    minHeight: 36,
  },
  addButtonText: {
    color: '#FFFFFF',
    fontSize: theme.fontSize.sm,
    fontWeight: '700',
  },
  pressed: {
    opacity: 0.8,
  },
  list: {
    flex: 1,
  },
  content: {
    paddingVertical: theme.spacing.sm,
  },
  emptyContainer: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  empty: {
    alignItems: 'center',
    padding: theme.spacing.xl,
    gap: theme.spacing.md,
  },
  emptyTitle: {
    fontSize: theme.fontSize.xl,
    fontWeight: '700',
    color: theme.colors.text,
  },
  emptyText: {
    fontSize: theme.fontSize.md,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
  },
  emptyButton: {
    alignSelf: 'stretch',
    marginTop: theme.spacing.sm,
  },
});
