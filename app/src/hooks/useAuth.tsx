import type { Session } from '@supabase/supabase-js';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { Platform } from 'react-native';

import { getMyProfile, registerPushToken } from '../api/client';
import { supabase } from '../api/supabase';
import type { Profile } from '../types';

export const DEMO_MODE = process.env.EXPO_PUBLIC_DEMO_MODE === 'true';
const DEMO_EMAIL = process.env.EXPO_PUBLIC_DEMO_EMAIL ?? '';
const DEMO_PASSWORD = process.env.EXPO_PUBLIC_DEMO_PASSWORD ?? '';

interface AuthContextValue {
  session: Session | null;
  profile: Profile | null;
  /** True until the initial session (and demo auto sign-in) has resolved. */
  loading: boolean;
  /**
   * The last profile fetch failed (backend unreachable / cold-starting).
   * Distinct from "profile loaded and has no experience_level" — see
   * needsOnboarding.
   */
  profileError: boolean;
  /** Show the onboarding quiz? Once profile.experience_level is set it is skipped. */
  needsOnboarding: boolean;
  refreshProfile: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

/**
 * Ask for notification permission and register the Expo push token with the
 * backend (POST /push/register). Runs after login; no-ops on simulators.
 *
 * Exported so the Settings toggle can call the same path — enabling
 * notifications there must register a token, not just request permission.
 */
export async function registerForPushNotifications(): Promise<void> {
  if (!Device.isDevice) return; // Push tokens require a physical device.

  const existing = await Notifications.getPermissionsAsync();
  let status = existing.status;
  if (status !== 'granted') {
    const requested = await Notifications.requestPermissionsAsync();
    status = requested.status;
  }
  if (status !== 'granted') return;

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Default',
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }

  const projectId = (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)
    ?.eas?.projectId;
  const token = await Notifications.getExpoPushTokenAsync(
    projectId && projectId !== 'REPLACE_WITH_EAS_PROJECT_ID' ? { projectId } : undefined,
  );
  await registerPushToken(token.data, Platform.OS);
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [sessionLoading, setSessionLoading] = useState(true);
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [profileError, setProfileError] = useState(false);
  const pushRegistered = useRef(false);

  const refreshProfile = useCallback(async () => {
    try {
      setProfile(await getMyProfile());
      setProfileError(false);
    } catch (err) {
      console.warn('Failed to load profile', err);
      setProfile(null);
      setProfileError(true);
    } finally {
      setProfileLoaded(true);
    }
  }, []);

  // Initial session + auth state subscription.
  useEffect(() => {
    let mounted = true;

    (async () => {
      const { data } = await supabase.auth.getSession();
      let current = data.session;

      // Demo mode: auto sign-in with the demo user (HANDOFF Section 9).
      if (!current && DEMO_MODE && DEMO_EMAIL && DEMO_PASSWORD) {
        const { data: demo, error } = await supabase.auth.signInWithPassword({
          email: DEMO_EMAIL,
          password: DEMO_PASSWORD,
        });
        if (error) console.warn('Demo auto sign-in failed', error.message);
        current = demo.session ?? null;
      }

      if (!mounted) return;
      setSession(current);
      setSessionLoading(false);
    })();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  // On sign-in: load profile + register push token once per app session.
  useEffect(() => {
    if (!session) {
      setProfile(null);
      setProfileLoaded(false);
      setProfileError(false);
      pushRegistered.current = false;
      return;
    }
    refreshProfile();
    if (!pushRegistered.current) {
      pushRegistered.current = true;
      registerForPushNotifications().catch((err) => {
        // Clear the guard so a later attempt (e.g. the Settings toggle, or
        // the next sign-in) can retry instead of staying silently unregistered.
        pushRegistered.current = false;
        console.warn('Push registration failed', err);
      });
    }
  }, [session, refreshProfile]);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

  // Wait for the profile fetch before deciding between Onboarding and Main.
  const loading = sessionLoading || (!!session && !profileLoaded);
  // Only route to onboarding when we actually know the profile lacks an
  // experience level. A failed fetch also yields profile === null, and routing
  // on that trapped the user on a screen with no tabs and no way to log out —
  // onboarding's own save hits the same unreachable backend.
  const needsOnboarding =
    !!session && !DEMO_MODE && !profileError && !!profile && !profile.experience_level;

  return (
    <AuthContext.Provider
      value={{ session, profile, loading, profileError, needsOnboarding, refreshProfile, signOut }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
