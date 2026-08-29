import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Sprout } from 'lucide-react-native';
import React, { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';

import { supabase } from '../../api/supabase';
import { Button, Field } from '../../components/ui';
import { theme } from '../../constants/theme';
import type { AuthStackParamList } from '../../types';

type Props = NativeStackScreenProps<AuthStackParamList, 'ForgotPassword'>;

/**
 * Password reset via Supabase Auth email (HANDOFF Section 2 — no custom
 * email code). Supabase sends the recovery link; the user completes the
 * reset in the browser.
 */
export function ForgotPasswordScreen({ navigation }: Props) {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);

  async function sendReset() {
    if (!email.trim()) {
      Alert.alert('Missing email', 'Enter the email you signed up with.');
      return;
    }
    setBusy(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim());
    setBusy(false);
    if (error) {
      Alert.alert('Reset failed', error.message);
      return;
    }
    Alert.alert('Email sent', 'Check your inbox for a password reset link.', [
      { text: 'OK', onPress: () => navigation.goBack() },
    ]);
  }

  return (
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <View style={styles.logoWrap}>
        <Sprout size={48} color={theme.colors.primary} />
        <Text style={styles.title}>Reset Password</Text>
        <Text style={styles.subtitle}>
          Enter your email and we&apos;ll send you a link to reset your password.
        </Text>
      </View>
      <Field
        label="Email"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
        placeholder="you@example.com"
      />
      <Button title="Send Reset Link" onPress={sendReset} loading={busy} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: theme.spacing.lg,
    gap: theme.spacing.md,
    backgroundColor: theme.colors.background,
    flexGrow: 1,
  },
  logoWrap: {
    alignItems: 'center',
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.sm,
  },
  title: {
    fontSize: theme.fontSize.xl + 4,
    fontWeight: '800',
    color: theme.colors.primaryDark,
  },
  subtitle: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },
});
