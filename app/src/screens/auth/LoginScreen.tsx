import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Sprout } from 'lucide-react-native';
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
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { supabase } from '../../api/supabase';
import { Button, Field } from '../../components/ui';
import { theme } from '../../constants/theme';
import type { AuthStackParamList } from '../../types';

type Props = NativeStackScreenProps<AuthStackParamList, 'Login'>;

export function LoginScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  async function signIn() {
    if (!email.trim() || !password) {
      Alert.alert('Missing info', 'Enter your email and password.');
      return;
    }
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    setBusy(false);
    if (error?.code === 'email_not_confirmed') {
      navigation.navigate('VerifyEmail', { email: email.trim() });
      return;
    }
    if (error) Alert.alert('Sign in failed', error.message);
    // On success the auth listener in useAuth switches to the main app.
  }

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={[styles.container, { paddingTop: insets.top + theme.spacing.xl }]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.logoWrap}>
          <Sprout size={48} color={theme.colors.primary} />
          <Text style={styles.title}>Welcome Back</Text>
          <Text style={styles.subtitle}>Sign in to check on your plants</Text>
        </View>

        <View style={styles.form}>
          <Field
            label="Email"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            placeholder="you@example.com"
          />
          <Field
            label="Password"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            placeholder="••••••••"
          />
          <Pressable
            onPress={() => navigation.navigate('ForgotPassword')}
            style={styles.forgotButton}
            accessibilityRole="button"
          >
            <Text style={styles.link}>Forgot password?</Text>
          </Pressable>

          <Button title="Sign In" onPress={signIn} loading={busy} />

          <Pressable
            onPress={() => navigation.navigate('Signup')}
            style={styles.linkButton}
            accessibilityRole="button"
          >
            <Text style={styles.linkMuted}>
              Don&apos;t have an account? <Text style={styles.link}>Sign Up</Text>
            </Text>
          </Pressable>
        </View>
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
    gap: theme.spacing.xl,
  },
  logoWrap: {
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  title: {
    fontSize: theme.fontSize.xl + 4,
    fontWeight: '800',
    color: theme.colors.primaryDark,
  },
  subtitle: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.textSecondary,
  },
  form: {
    gap: theme.spacing.md,
  },
  forgotButton: {
    alignSelf: 'flex-end',
    minHeight: theme.touchTarget,
    justifyContent: 'center',
  },
  linkButton: {
    minHeight: theme.touchTarget,
    alignItems: 'center',
    justifyContent: 'center',
  },
  link: {
    color: theme.colors.primary,
    fontWeight: '600',
    fontSize: theme.fontSize.md,
  },
  linkMuted: {
    color: theme.colors.textSecondary,
    fontSize: theme.fontSize.md,
  },
});
