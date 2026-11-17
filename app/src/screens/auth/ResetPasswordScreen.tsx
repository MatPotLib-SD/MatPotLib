import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { KeyRound } from 'lucide-react-native';
import React, { useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { supabase } from '../../api/supabase';
import { Button, Field } from '../../components/ui';
import { theme } from '../../constants/theme';
import type { AuthStackParamList } from '../../types';

type Props = NativeStackScreenProps<AuthStackParamList, 'ResetPassword'>;

/**
 * Completes a password reset with the one-time code from the Supabase
 * "Reset password" email (template must include {{ .Token }}). Verifying the
 * code signs the user in, and useAuth then leaves the auth stack, so the new
 * password is collected up front and set immediately after verification.
 */
export function ResetPasswordScreen({ route }: Props) {
  const { email } = route.params;
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [resending, setResending] = useState(false);

  async function resetPassword() {
    const token = code.trim();
    if (!token) {
      Alert.alert('Missing code', 'Enter the code from your email.');
      return;
    }
    if (password.length < 8) {
      Alert.alert('Weak password', 'Use at least 8 characters.');
      return;
    }
    if (password !== confirm) {
      Alert.alert('Passwords do not match', 'Please re-enter your password.');
      return;
    }
    setBusy(true);
    const { error } = await supabase.auth.verifyOtp({ email, token, type: 'recovery' });
    if (error) {
      setBusy(false);
      Alert.alert('Reset failed', error.message);
      return;
    }
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (updateError) {
      Alert.alert(
        'Password not changed',
        `You are signed in, but the new password was not saved: ${updateError.message} You can change it in Settings.`,
      );
      return;
    }
    Alert.alert('Password updated', 'Use your new password the next time you sign in.');
  }

  async function resend() {
    setResending(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email);
    setResending(false);
    if (error) {
      Alert.alert('Could not resend', error.message);
      return;
    }
    Alert.alert('Code sent', `We sent a new code to ${email}.`);
  }

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <View style={styles.logoWrap}>
          <KeyRound size={48} color={theme.colors.primary} />
          <Text style={styles.title}>Set a new password</Text>
          <Text style={styles.subtitle}>
            Enter the code we sent to {email}, then choose a new password.
          </Text>
        </View>
        <Field
          label="Reset code"
          value={code}
          onChangeText={setCode}
          keyboardType="number-pad"
          textContentType="oneTimeCode"
          autoComplete="one-time-code"
          maxLength={10}
          placeholder="123456"
        />
        <Field
          label="New password"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          textContentType="newPassword"
          placeholder="At least 8 characters"
        />
        <Field
          label="Confirm new password"
          value={confirm}
          onChangeText={setConfirm}
          secureTextEntry
          textContentType="newPassword"
          placeholder="Re-enter password"
        />
        <Button title="Reset Password" onPress={resetPassword} loading={busy} />
        <Pressable
          onPress={resend}
          disabled={resending}
          style={styles.linkButton}
          accessibilityRole="button"
        >
          <Text style={styles.linkMuted}>
            Didn&apos;t get it?{' '}
            <Text style={styles.link}>{resending ? 'Sending...' : 'Resend code'}</Text>
          </Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  container: {
    padding: theme.spacing.lg,
    gap: theme.spacing.md,
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
  linkButton: {
    minHeight: theme.touchTarget,
    alignItems: 'center',
    justifyContent: 'center',
  },
  link: {
    color: theme.colors.primary,
    fontWeight: '600',
    fontSize: theme.fontSize.sm,
  },
  linkMuted: {
    color: theme.colors.textSecondary,
    fontSize: theme.fontSize.sm,
  },
});
