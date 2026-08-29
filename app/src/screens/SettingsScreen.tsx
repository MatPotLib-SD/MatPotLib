import * as Notifications from 'expo-notifications';
import { Bell, Cpu, LogOut, Trash2 } from 'lucide-react-native';
import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { claimDevice, deleteDevice, listDevices, updateMyProfile } from '../api/client';
import { supabase } from '../api/supabase';
import { Button, Field, ScreenHeader, SectionTitle } from '../components/ui';
import { relativeTime } from '../constants/helpers';
import { theme } from '../constants/theme';
import { useAuth, registerForPushNotifications } from '../hooks/useAuth';
import { usePolling } from '../hooks/usePolling';
import type { Device } from '../types';

/** "Dylan Johnson" → "DJ"; falls back to the email's first letter. */
function initials(name: string | null | undefined, email: string | null | undefined): string {
  const source = name?.trim();
  if (source) {
    const parts = source.split(/\s+/);
    return parts
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase() ?? '')
      .join('');
  }
  return email?.[0]?.toUpperCase() ?? '?';
}

/**
 * Settings (mockup): profile card with avatar, ACCOUNT (display name,
 * change password), DEVICES (claim by code, list/unlink), NOTIFICATIONS
 * (push toggle), then a standalone log-out card pinned last.
 */
export function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const { profile, refreshProfile, signOut, session } = useAuth();

  const [devices, setDevices] = useState<Device[]>([]);
  const [claimCode, setClaimCode] = useState('');
  const [claiming, setClaiming] = useState(false);
  const [displayName, setDisplayName] = useState(profile?.display_name ?? '');
  const [savingName, setSavingName] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    setDisplayName(profile?.display_name ?? '');
  }, [profile?.display_name]);

  const loadDevices = useCallback(async () => {
    try {
      setDevices(await listDevices());
    } catch (err) {
      console.warn('Failed to load devices', err);
    }
  }, []);

  // Same 60s refresh the other tabs use — device status and last_seen_at go
  // stale otherwise, and this panel is where users check whether a pot is alive.
  usePolling(loadDevices);

  useEffect(() => {
    // Reflect current OS notification permission in the toggle.
    Notifications.getPermissionsAsync()
      .then(({ status }) => setNotificationsEnabled(status === 'granted'))
      .catch(() => setNotificationsEnabled(false));
  }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([loadDevices(), refreshProfile()]);
    setRefreshing(false);
  }, [loadDevices, refreshProfile]);

  async function claim() {
    const code = claimCode.trim();
    if (!code) {
      Alert.alert('Missing code', 'Enter the claim code printed on your pot.');
      return;
    }
    setClaiming(true);
    try {
      await claimDevice(code);
      setClaimCode('');
      await loadDevices();
      Alert.alert('Device claimed', 'Your smart pot is now linked to your account.');
    } catch (err) {
      Alert.alert('Claim failed', err instanceof Error ? err.message : 'Please try again.');
    } finally {
      setClaiming(false);
    }
  }

  function unlink(device: Device) {
    Alert.alert('Unlink device', `Remove "${device.name ?? 'this device'}" from your account?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Unlink',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteDevice(device.id);
            await loadDevices();
          } catch (err) {
            Alert.alert('Failed', err instanceof Error ? err.message : 'Please try again.');
          }
        },
      },
    ]);
  }

  async function saveDisplayName() {
    setSavingName(true);
    try {
      await updateMyProfile({ display_name: displayName.trim() });
      await refreshProfile();
      Alert.alert('Saved', 'Your profile was updated.');
    } catch (err) {
      Alert.alert('Failed', err instanceof Error ? err.message : 'Please try again.');
    } finally {
      setSavingName(false);
    }
  }

  async function changePassword() {
    if (newPassword.length < 6) {
      Alert.alert('Password too short', 'Use at least 6 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      Alert.alert('Passwords do not match', 'Re-enter the same password in both fields.');
      return;
    }
    setChangingPassword(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      setNewPassword('');
      setConfirmPassword('');
      Alert.alert('Password changed', 'Use your new password the next time you log in.');
    } catch (err) {
      Alert.alert('Failed', err instanceof Error ? err.message : 'Please try again.');
    } finally {
      setChangingPassword(false);
    }
  }

  async function toggleNotifications(value: boolean) {
    if (value) {
      const { status } = await Notifications.requestPermissionsAsync();
      setNotificationsEnabled(status === 'granted');
      if (status !== 'granted') {
        Alert.alert(
          'Permission needed',
          'Enable notifications for MatPotLib in your system settings.',
        );
        return;
      }
      // Permission alone delivers nothing — the backend also needs this
      // device's Expo push token. Without this call, a user who denied at
      // first launch and enabled the toggle here would silently never receive
      // a push.
      try {
        await registerForPushNotifications();
      } catch (err) {
        console.warn('Push registration failed', err);
        setNotificationsEnabled(false);
        Alert.alert(
          'Could not enable notifications',
          err instanceof Error ? err.message : 'Please try again.',
        );
      }
    } else {
      // OS permissions cannot be revoked from inside the app; this only
      // mutes the in-app preference. Point users at system settings.
      setNotificationsEnabled(false);
      Alert.alert('Notifications muted', 'To fully disable them, use your system settings.');
    }
  }

  return (
    <ScrollView
      style={styles.flex}
      contentContainerStyle={[styles.container, { paddingTop: insets.top + theme.spacing.sm }]}
      keyboardShouldPersistTaps="handled"
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor={theme.colors.primary}
          colors={[theme.colors.primary]}
        />
      }
    >
      <ScreenHeader title="Settings" />

      <View style={styles.card}>
        <View style={styles.profileRow}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>
              {initials(profile?.display_name, session?.user.email)}
            </Text>
          </View>
          <View style={styles.profileInfo}>
            <Text style={styles.profileName}>{profile?.display_name || 'Plant Parent'}</Text>
            <Text style={styles.profileEmail}>{session?.user.email ?? ''}</Text>
          </View>
        </View>
      </View>

      <View style={styles.section}>
        <SectionTitle>Account</SectionTitle>
        <View style={styles.card}>
          <Field label="Display name" value={displayName} onChangeText={setDisplayName} />
          <Button title="Save Profile" onPress={saveDisplayName} loading={savingName} />
        </View>
        <View style={styles.card}>
          <Field
            label="New password"
            value={newPassword}
            onChangeText={setNewPassword}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            placeholder="At least 6 characters"
          />
          <Field
            label="Confirm new password"
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
          />
          <Button title="Change Password" onPress={changePassword} loading={changingPassword} />
        </View>
      </View>

      <View style={styles.section}>
        <SectionTitle>Devices</SectionTitle>
        <View style={styles.card}>
          <Text style={styles.hint}>
            Enter the claim code printed on your smart pot to link it to your account.
          </Text>
          <Field
            value={claimCode}
            onChangeText={setClaimCode}
            autoCapitalize="characters"
            autoCorrect={false}
            placeholder="e.g. POT-1234-ABCD"
          />
          <Button title="Claim Device" onPress={claim} loading={claiming} />
        </View>
        {devices.length > 0 ? (
          <View style={styles.card}>
            {devices.map((device) => (
              <View key={device.id} style={styles.deviceRow}>
                <Cpu size={20} color={theme.colors.primary} />
                <View style={styles.deviceInfo}>
                  <Text style={styles.deviceName}>{device.name ?? 'Smart Pot'}</Text>
                  <Text style={styles.deviceMeta}>
                    {device.status === 'online' ? 'Online' : 'Offline'} · last seen{' '}
                    {relativeTime(device.last_seen_at)}
                  </Text>
                </View>
                <Pressable
                  onPress={() => unlink(device)}
                  accessibilityRole="button"
                  accessibilityLabel="Unlink device"
                  style={styles.iconButton}
                >
                  <Trash2 size={20} color={theme.colors.status.error} />
                </Pressable>
              </View>
            ))}
          </View>
        ) : null}
      </View>

      <View style={styles.section}>
        <SectionTitle>Notifications</SectionTitle>
        <View style={styles.card}>
          <View style={styles.switchRow}>
            <View style={styles.switchLabelRow}>
              <Bell size={18} color={theme.colors.text} />
              <Text style={styles.switchLabel}>Push Notifications</Text>
            </View>
            <Switch
              value={notificationsEnabled}
              onValueChange={toggleNotifications}
              trackColor={{ true: theme.colors.primary }}
              thumbColor="#FFFFFF"
            />
          </View>
        </View>
      </View>

      <View style={styles.card}>
        <Pressable
          onPress={() => signOut()}
          accessibilityRole="button"
          style={({ pressed }) => [styles.logoutRow, pressed && styles.pressed]}
        >
          <LogOut size={18} color={theme.colors.status.error} />
          <Text style={styles.logoutText}>Log Out</Text>
        </Pressable>
      </View>
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
    gap: theme.spacing.md,
    paddingBottom: theme.spacing.xl,
  },
  section: {
    gap: theme.spacing.sm,
  },
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: theme.spacing.md,
    gap: theme.spacing.md,
    ...theme.shadow.card,
  },
  profileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: theme.colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: '#FFFFFF',
    fontSize: theme.fontSize.md,
    fontWeight: '800',
  },
  profileInfo: {
    flex: 1,
  },
  profileName: {
    fontSize: theme.fontSize.md,
    fontWeight: '700',
    color: theme.colors.text,
  },
  profileEmail: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.textSecondary,
  },
  hint: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.textSecondary,
  },
  deviceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
    minHeight: theme.touchTarget,
  },
  deviceInfo: {
    flex: 1,
  },
  deviceName: {
    fontSize: theme.fontSize.md,
    fontWeight: '600',
    color: theme.colors.text,
  },
  deviceMeta: {
    fontSize: theme.fontSize.xs,
    color: theme.colors.textSecondary,
  },
  iconButton: {
    minWidth: theme.touchTarget,
    minHeight: theme.touchTarget,
    alignItems: 'center',
    justifyContent: 'center',
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: theme.touchTarget,
  },
  switchLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  switchLabel: {
    fontSize: theme.fontSize.md,
    color: theme.colors.text,
  },
  logoutRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    minHeight: theme.touchTarget,
  },
  pressed: {
    opacity: 0.7,
  },
  logoutText: {
    fontSize: theme.fontSize.md,
    fontWeight: '700',
    color: theme.colors.status.error,
  },
});
