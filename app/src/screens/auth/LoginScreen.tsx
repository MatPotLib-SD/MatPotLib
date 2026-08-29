import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
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

// Completes any pending browser auth session (no-op on cold start).
WebBrowser.maybeCompleteAuthSession();

type Props = NativeStackScreenProps<AuthStackParamList, 'Login'>;

/** Parse `key=value` pairs out of a redirect URL's fragment (or query). */
function getParamsFromUrl(url: string): Record<string, string> {
  const out: Record<string, string> = {};
  const hashIndex = url.indexOf('#');
  const queryIndex = url.indexOf('?');
  const splitAt = hashIndex >= 0 ? hashIndex : queryIndex;
  if (splitAt < 0) return out;
  for (const pair of url.slice(splitAt + 1).split('&')) {
    const [key, value] = pair.split('=');
    if (key && value) out[decodeURIComponent(key)] = decodeURIComponent(value);
  }
  return out;
}

export function LoginScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);

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
    if (error) Alert.alert('Sign in failed', error.message);
    // On success the auth listener in useAuth switches to the main app.
  }

  /**
   * Google Sign-In via Supabase OAuth + expo-web-browser.
   *
   * Prerequisites (one-time manual setup — see DEPLOYMENT notes):
   *  1. Enable the Google provider in Supabase Dashboard -> Auth -> Providers
   *     with credentials from Google Cloud Console.
   *  2. Add the app redirect URL (matpotlib://auth/callback) to
   *     Supabase -> Auth -> URL Configuration -> Redirect URLs.
   *
   * Flow: ask Supabase for the provider URL (skipBrowserRedirect), open it in
   * an auth session browser, then read the access/refresh tokens from the
   * redirect fragment and hand them to supabase.auth.setSession().
   */
  async function signInWithGoogle() {
    setGoogleBusy(true);
    try {
      const redirectTo = Linking.createURL('auth/callback');
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo, skipBrowserRedirect: true },
      });
      if (error || !data.url) {
        Alert.alert('Google sign-in failed', error?.message ?? 'No auth URL returned.');
        return;
      }
      const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
      if (result.type === 'success' && result.url) {
        const params = getParamsFromUrl(result.url);
        if (params.access_token && params.refresh_token) {
          const { error: sessionError } = await supabase.auth.setSession({
            access_token: params.access_token,
            refresh_token: params.refresh_token,
          });
          if (sessionError) Alert.alert('Google sign-in failed', sessionError.message);
        } else {
          Alert.alert('Google sign-in failed', 'No tokens in redirect URL.');
        }
      } else if (result.type !== 'cancel' && result.type !== 'dismiss') {
        // 'cancel'/'dismiss' mean the user backed out on purpose — staying
        // silent there is right. Anything else is a real failure, and used to
        // leave the button simply doing nothing.
        Alert.alert('Google sign-in failed', 'The sign-in window closed unexpectedly.');
      }
    } finally {
      setGoogleBusy(false);
    }
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

          <View style={styles.dividerRow}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>or</Text>
            <View style={styles.dividerLine} />
          </View>

          <Button
            title="Continue with Google"
            variant="secondary"
            onPress={signInWithGoogle}
            loading={googleBusy}
          />

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
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: theme.colors.border,
  },
  dividerText: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.textDisabled,
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
