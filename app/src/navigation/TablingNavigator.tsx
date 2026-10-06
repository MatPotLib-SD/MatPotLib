import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Settings as SettingsIcon, Sprout } from 'lucide-react-native';
import React from 'react';

import { theme } from '../constants/theme';
import { HomeStackNavigator } from './TabNavigator';
import { SettingsScreen } from '../screens/SettingsScreen';
import { TablingScreen } from '../screens/TablingScreen';
import type { TablingTabParamList } from '../types';

const Tab = createBottomTabNavigator<TablingTabParamList>();

export function TablingNavigator() {
  return (
    <Tab.Navigator screenOptions={{
      headerShown: false,
      tabBarActiveTintColor: theme.colors.primary,
      tabBarInactiveTintColor: theme.colors.textDisabled,
      tabBarStyle: { backgroundColor: theme.colors.surface, borderTopColor: theme.colors.border },
    }}>
      <Tab.Screen name="Activity" component={TablingScreen}
        options={{ tabBarIcon: ({ color, size }) => <Sprout color={color} size={size} /> }} />
      <Tab.Screen name="Plants" component={HomeStackNavigator}
        options={{ tabBarIcon: ({ color, size }) => <Sprout color={color} size={size} /> }} />
      <Tab.Screen name="Settings" component={SettingsScreen}
        options={{ tabBarIcon: ({ color, size }) => <SettingsIcon color={color} size={size} /> }} />
    </Tab.Navigator>
  );
}
