import { createNativeStackNavigator } from '@react-navigation/native-stack';
import React from 'react';

import { AuthNavigator } from './AuthNavigator';
import { TabNavigator } from './TabNavigator';
import { LoadingView } from '../components/ui';
import { useAuth } from '../hooks/useAuth';
import { OnboardingScreen } from '../screens/onboarding/OnboardingScreen';
import type { RootStackParamList } from '../types';

const Stack = createNativeStackNavigator<RootStackParamList>();

/**
 * Auth gate:
 *  - no session      -> Auth stack (login / signup / forgot password)
 *  - needs onboarding-> 3-step quiz (skipped when profile.experience_level set,
 *                       in demo mode, or when the profile fetch failed — see
 *                       needsOnboarding in useAuth)
 *  - otherwise       -> main bottom tabs
 *
 * A failed profile fetch deliberately falls through to the tabs rather than
 * onboarding: the tabs surface their own error states and still expose
 * Settings -> Log Out, whereas onboarding is a dead end while the backend is
 * down.
 */
export function RootNavigator() {
  const { session, loading, needsOnboarding } = useAuth();

  if (loading) return <LoadingView />;

  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      {!session ? (
        <Stack.Screen name="Auth" component={AuthNavigator} />
      ) : needsOnboarding ? (
        <Stack.Screen name="Onboarding" component={OnboardingScreen} />
      ) : (
        <Stack.Screen name="Main" component={TabNavigator} />
      )}
    </Stack.Navigator>
  );
}
