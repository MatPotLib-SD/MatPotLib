import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Check, Cpu } from 'lucide-react-native';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import {
  createPlant,
  deletePlant,
  getPlant,
  listDevices,
  searchSpecies,
  updatePlant,
} from '../api/client';
import { Button, ErrorState, Field, SectionTitle } from '../components/ui';
import { theme } from '../constants/theme';
import type { Device, HomeStackParamList, SpeciesRow } from '../types';

type Props = NativeStackScreenProps<HomeStackParamList, 'AddEditPlant'>;

/**
 * Add / Edit Plant: nickname, debounced species search (GET /species?q=),
 * device assignment. POST /plants or PUT /plants/:id on save.
 */
export function AddEditPlantScreen({ navigation, route }: Props) {
  const plantId = route.params?.plantId;
  const isEdit = !!plantId;

  const [nickname, setNickname] = useState('');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SpeciesRow[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedSpecies, setSelectedSpecies] = useState<SpeciesRow | null>(null);
  const [devices, setDevices] = useState<Device[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [prefillError, setPrefillError] = useState<string | null>(null);
  const [devicesError, setDevicesError] = useState(false);
  const [searchError, setSearchError] = useState(false);
  const [prefillAttempt, setPrefillAttempt] = useState(0);

  // Prefill when editing. A failure here is NOT cosmetic: the form would come
  // up blank, and saving it would PUT plant_species_id: null / device_id: null
  // and wipe the plant's real assignments. So we block the form instead.
  useEffect(() => {
    if (!plantId) return;
    let cancelled = false;
    setPrefillError(null);
    getPlant(plantId)
      .then((plant) => {
        if (cancelled) return;
        setNickname(plant.nickname ?? '');
        setSelectedDeviceId(plant.device_id);
        if (plant.species) setSelectedSpecies(plant.species);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        console.warn('Failed to load plant', err);
        setPrefillError(err instanceof Error ? err.message : 'Please try again.');
      });
    return () => {
      cancelled = true;
    };
  }, [plantId, prefillAttempt]);

  useEffect(() => {
    listDevices()
      .then((rows) => {
        setDevices(rows);
        setDevicesError(false);
      })
      .catch((err) => {
        console.warn('Failed to load devices', err);
        setDevicesError(true);
      });
  }, []);

  // Debounced species search (300ms). The backend may take a moment when it
  // falls back to LLM enrichment for unknown species.
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      setSearching(false);
      setSearchError(false);
      return;
    }
    setSearching(true);
    const handle = setTimeout(() => {
      searchSpecies(q)
        .then((rows) => {
          setResults(rows.slice(0, 10));
          setSearchError(false);
        })
        .catch((err) => {
          console.warn('Species search failed', err);
          setResults([]);
          setSearchError(true);
        })
        .finally(() => setSearching(false));
    }, 300);
    return () => clearTimeout(handle);
  }, [query]);

  const save = useCallback(async () => {
    if (!nickname.trim()) {
      Alert.alert('Missing name', 'Give your plant a nickname.');
      return;
    }
    setSaving(true);
    try {
      const input = {
        nickname: nickname.trim(),
        plant_species_id: selectedSpecies?.id ?? null,
        device_id: selectedDeviceId,
      };
      if (isEdit && plantId) await updatePlant(plantId, input);
      else await createPlant(input);
      navigation.goBack();
    } catch (err) {
      Alert.alert('Save failed', err instanceof Error ? err.message : 'Please try again.');
    } finally {
      setSaving(false);
    }
  }, [nickname, selectedSpecies, selectedDeviceId, isEdit, plantId, navigation]);

  function removePlant() {
    if (!plantId) return;
    Alert.alert('Remove plant', 'This deletes the plant and its settings.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          try {
            await deletePlant(plantId);
            navigation.goBack();
          } catch (err) {
            Alert.alert('Failed', err instanceof Error ? err.message : 'Please try again.');
          }
        },
      },
    ]);
  }

  if (isEdit && prefillError) {
    return (
      <ScrollView style={styles.flex} contentContainerStyle={styles.container}>
        <ErrorState
          title="Can't load this plant"
          message={`${prefillError} Editing now would clear this plant's species and device.`}
          onRetry={() => setPrefillAttempt((n) => n + 1)}
        />
      </ScrollView>
    );
  }

  return (
    <ScrollView
      style={styles.flex}
      contentContainerStyle={styles.container}
      keyboardShouldPersistTaps="handled"
    >
      <Field
        label="Nickname"
        value={nickname}
        onChangeText={setNickname}
        placeholder="e.g. Fernando the Fern"
      />

      <View style={styles.section}>
        <SectionTitle>Species</SectionTitle>
        {selectedSpecies ? (
          <View style={styles.selectedSpecies}>
            <View style={styles.speciesInfo}>
              <Text style={styles.speciesName}>
                {selectedSpecies.common_name ?? selectedSpecies.scientific_name ?? 'Unknown'}
              </Text>
              {selectedSpecies.scientific_name ? (
                <Text style={styles.speciesLatin}>{selectedSpecies.scientific_name}</Text>
              ) : null}
            </View>
            <Pressable
              onPress={() => setSelectedSpecies(null)}
              accessibilityRole="button"
              style={styles.clearButton}
            >
              <Text style={styles.clearText}>Change</Text>
            </Pressable>
          </View>
        ) : (
          <>
            <Field
              value={query}
              onChangeText={setQuery}
              placeholder="Search species, e.g. monstera"
              autoCorrect={false}
            />
            {searching ? <ActivityIndicator color={theme.colors.primary} /> : null}
            {results.map((row) => (
              <Pressable
                key={row.id}
                onPress={() => {
                  setSelectedSpecies(row);
                  setQuery('');
                  setResults([]);
                }}
                accessibilityRole="button"
                style={styles.resultRow}
              >
                <Text style={styles.speciesName}>
                  {row.common_name ?? row.scientific_name ?? 'Unknown'}
                </Text>
                {row.scientific_name ? (
                  <Text style={styles.speciesLatin}>{row.scientific_name}</Text>
                ) : null}
              </Pressable>
            ))}
            {!searching && query.trim().length >= 2 && results.length === 0 ? (
              <Text style={styles.hint}>
                {searchError
                  ? "Couldn't reach the species catalogue. Check your connection and try again."
                  : 'No matches yet — keep typing or try another name.'}
              </Text>
            ) : null}
          </>
        )}
      </View>

      <View style={styles.section}>
        <SectionTitle>Device</SectionTitle>
        {devices.length === 0 ? (
          <Text style={styles.hint}>
            {devicesError
              ? "Couldn't load your devices. Check your connection and try again."
              : 'No devices available. Claim your smart pot in Settings first.'}
          </Text>
        ) : (
          <>
            <Pressable
              onPress={() => setSelectedDeviceId(null)}
              accessibilityRole="button"
              style={[styles.deviceRow, selectedDeviceId === null && styles.deviceRowSelected]}
            >
              <Text style={styles.deviceName}>No device</Text>
              {selectedDeviceId === null ? (
                <Check size={20} color={theme.colors.primary} />
              ) : null}
            </Pressable>
            {devices.map((device) => (
              <Pressable
                key={device.id}
                onPress={() => setSelectedDeviceId(device.id)}
                accessibilityRole="button"
                style={[
                  styles.deviceRow,
                  selectedDeviceId === device.id && styles.deviceRowSelected,
                ]}
              >
                <Cpu size={20} color={theme.colors.primary} />
                <Text style={styles.deviceName}>{device.name ?? 'Smart Pot'}</Text>
                {selectedDeviceId === device.id ? (
                  <Check size={20} color={theme.colors.primary} />
                ) : null}
              </Pressable>
            ))}
          </>
        )}
      </View>

      <Button title={isEdit ? 'Save Changes' : 'Add Plant'} onPress={save} loading={saving} />
      {isEdit ? <Button title="Remove Plant" variant="danger" onPress={removePlant} /> : null}
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
    gap: theme.spacing.lg,
    paddingBottom: theme.spacing.xl,
  },
  section: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: theme.spacing.md,
    gap: theme.spacing.sm + theme.spacing.xs,
    ...theme.shadow.card,
  },
  hint: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.textSecondary,
  },
  selectedSpecies: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing.sm,
  },
  speciesInfo: {
    flex: 1,
  },
  speciesName: {
    fontSize: theme.fontSize.md,
    fontWeight: '600',
    color: theme.colors.text,
  },
  speciesLatin: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.textSecondary,
    fontStyle: 'italic',
  },
  clearButton: {
    minHeight: theme.touchTarget,
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.sm,
  },
  clearText: {
    color: theme.colors.primary,
    fontWeight: '600',
  },
  resultRow: {
    minHeight: theme.touchTarget,
    justifyContent: 'center',
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
    paddingVertical: theme.spacing.sm,
  },
  deviceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    minHeight: theme.touchTarget,
    borderRadius: theme.radius.sm,
    paddingHorizontal: theme.spacing.sm,
  },
  deviceRowSelected: {
    backgroundColor: theme.colors.primaryLight,
  },
  deviceName: {
    flex: 1,
    fontSize: theme.fontSize.md,
    color: theme.colors.text,
  },
});
