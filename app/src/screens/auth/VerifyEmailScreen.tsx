import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { MailCheck } from 'lucide-react-native';
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

type Props = NativeStackScreenProps<AuthStackParamList, 'VerifyEmail'>;

/**
 * Confirms a new account with the one-time code from the Supabase
 * "Confirm signup" email. Codes avoid redirect links, which cannot reach the
 * app from a phone (no stable URL in Expo Go). The Supabase email template
 * must include {{ .Token }}.
 */
export function VerifyEmailScreen({ navigation, route }: Props) {
  const { email } = route.params;
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [resending, setResending] = useState(false);

  async function verify() {
    const token = code.trim();
    if (!token) {
      Alert.alert('Missing code', 'Enter the code from your email.');
      return;
    }
    setBusy(true);
    const { error } = await supabase.auth.verifyOtp({ email, token, type: 'email' });
    setBusy(false);
    if (error) Alert.alert('Verification failed', error.message);
    // On success the auth listener in useAuth switches to the main app.
  }

  async function resend() {
    setResending(true);
    const { error } = await supabase.auth.resend({ type: 'signup', email });
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
          <MailCheck size={48} color={theme.colors.primary} />
          <Text style={styles.title}>Check your email</Text>
          <Text style={styles.subtitle}>
            Enter the code we sent to {email} to confirm your account.
          </Text>
        </View>
        <Field
          label="Confirmation code"
          value={code}
          onChangeText={setCode}
          keyboardType="number-pad"
          textContentType="oneTimeCode"
          autoComplete="one-time-code"
          maxLength={10}
          placeholder="123456"
        />
        <Button title="Verify" onPress={verify} loading={busy} />
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
        <Pressable
          onPress={() => navigation.navigate('Login')}
          style={styles.linkButton}
          accessibilityRole="button"
        >
          <Text style={styles.link}>Back to Sign In</Text>
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
