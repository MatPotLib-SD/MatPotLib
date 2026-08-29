import { BellOff } from 'lucide-react-native';
import React, { useCallback, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { listAlerts } from '../api/client';
import { ErrorState, ScreenHeader } from '../components/ui';
import { relativeTime } from '../constants/helpers';
import { theme } from '../constants/theme';
import { usePolling } from '../hooks/usePolling';
import type { Alert as AlertRow } from '../types';

function severityColor(severity: string): string {
  return theme.colors.severity[severity] ?? theme.colors.status.info;
}

/** Same vocabulary as METRIC_LABELS in backend/src/alerts/alerts.service.ts
 *  (title-cased for headings) so a row's title and the message body beneath it
 *  no longer disagree — "Low Moisture" over "Soil moisture is low". */
const METRIC_LABELS: Record<string, string> = {
  moisture: 'Soil Moisture',
  temp: 'Temperature',
  humidity: 'Humidity',
  lux: 'Light Level',
};

/** "moisture_low" → "Low Soil Moisture", "temp_recovered" → "Temperature Recovered". */
function alertTitle(type: string): string {
  const [metric, direction] = type.split('_');
  const label = METRIC_LABELS[metric] ?? metric;
  if (direction === 'low') return `Low ${label}`;
  if (direction === 'high') return `High ${label}`;
  if (direction === 'recovered') return `${label} Recovered`;
  return type.replace(/_/g, ' ');
}

function AlertItem({ alert }: { alert: AlertRow }) {
  const color = severityColor(alert.severity);
  return (
    <View style={[styles.item, { borderLeftColor: color }]}>
      <View style={styles.itemHeader}>
        <Text style={styles.title}>{alertTitle(alert.type)}</Text>
        <Text style={styles.time}>{relativeTime(alert.ts)}</Text>
      </View>
      <Text style={styles.message}>{alert.message}</Text>
      {alert.status === 'resolved' ? <Text style={styles.resolved}>Resolved</Text> : null}
    </View>
  );
}

/** Severity-coded alert history (mockup) with pull-to-refresh + 60s polling. */
export function AlertsScreen() {
  const insets = useSafeAreaInsets();
  const [alerts, setAlerts] = useState<AlertRow[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setAlerts(await listAlerts());
      setError(null);
    } catch (err) {
      console.warn('Failed to load alerts', err);
      // Do NOT fall back to [] — that renders "All clear", which is the exact
      // opposite of the truth when we simply could not reach the backend.
      setError(err instanceof Error ? err.message : 'Please try again.');
    }
  }, []);

  usePolling(load);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  return (
    <View style={[styles.screen, { paddingTop: insets.top + theme.spacing.sm }]}>
      <View style={styles.header}>
        <ScreenHeader title="Alerts" />
      </View>
      <FlatList
        style={styles.list}
        contentContainerStyle={
          error || (alerts && alerts.length === 0) ? styles.emptyContainer : styles.content
        }
        data={alerts ?? []}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <AlertItem alert={item} />}
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
              title="Can't load alerts"
              message={error}
              onRetry={onRefresh}
              retrying={refreshing}
            />
          ) : alerts === null ? null : (
            <View style={styles.empty}>
              <BellOff size={56} color={theme.colors.textDisabled} strokeWidth={1.5} />
              <Text style={styles.emptyTitle}>All clear</Text>
              <Text style={styles.emptyText}>
                You&apos;ll see alerts here when a plant needs attention.
              </Text>
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
  list: {
    flex: 1,
  },
  content: {
    paddingHorizontal: theme.spacing.md,
    paddingBottom: theme.spacing.md,
    gap: theme.spacing.sm + theme.spacing.xs,
  },
  emptyContainer: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  item: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.md,
    borderLeftWidth: 4,
    padding: theme.spacing.md,
    gap: theme.spacing.xs + 2,
    ...theme.shadow.card,
  },
  itemHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing.sm,
  },
  title: {
    flex: 1,
    fontSize: theme.fontSize.md,
    fontWeight: '700',
    color: theme.colors.text,
  },
  time: {
    fontSize: theme.fontSize.xs,
    color: theme.colors.textDisabled,
  },
  message: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.textSecondary,
    lineHeight: 20,
  },
  resolved: {
    fontSize: theme.fontSize.xs,
    fontWeight: '700',
    color: theme.colors.status.ok,
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
  },
});
