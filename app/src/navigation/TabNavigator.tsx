import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Bell, Settings as SettingsIcon, Sprout } from 'lucide-react-native';
import React from 'react';

import { theme } from '../constants/theme';
import { AddEditPlantScreen } from '../screens/AddEditPlantScreen';
import { AlertsScreen } from '../screens/AlertsScreen';
import { HomeScreen } from '../screens/HomeScreen';
import { PlantDataScreen } from '../screens/PlantDataScreen';
import { SettingsScreen } from '../screens/SettingsScreen';
import type { HomeStackParamList, MainTabParamList } from '../types';

const Tab = createBottomTabNavigator<MainTabParamList>();
const HomeStack = createNativeStackNavigator<HomeStackParamList>();

// Screens render their own large mockup-style titles; native headers are
// kept only where a back button is needed (PlantData, AddEditPlant).
function HomeStackNavigator() {
  return (
    <HomeStack.Navigator
      screenOptions={{
        headerTintColor: theme.colors.primary,
        headerTitleStyle: { color: theme.colors.text },
        headerStyle: { backgroundColor: theme.colors.background },
        headerShadowVisible: false,
        contentStyle: { backgroundColor: theme.colors.background },
      }}
    >
      <HomeStack.Screen
        name="PlantList"
        component={HomeScreen}
        options={{ headerShown: false }}
      />
      <HomeStack.Screen name="PlantData" component={PlantDataScreen} options={{ title: '' }} />
      <HomeStack.Screen
        name="AddEditPlant"
        component={AddEditPlantScreen}
        options={({ route }) => ({ title: route.params?.plantId ? 'Edit Plant' : 'Add Plant' })}
      />
    </HomeStack.Navigator>
  );
}

export function TabNavigator() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: theme.colors.primary,
        tabBarInactiveTintColor: theme.colors.textDisabled,
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
        tabBarStyle: {
          backgroundColor: theme.colors.surface,
          borderTopColor: theme.colors.border,
        },
      }}
    >
      <Tab.Screen
        name="HomeStack"
        component={HomeStackNavigator}
        options={{
          title: 'My Plants',
          tabBarIcon: ({ color, size }) => <Sprout color={color} size={size} />,
        }}
      />
      <Tab.Screen
        name="Alerts"
        component={AlertsScreen}
        options={{
          tabBarIcon: ({ color, size }) => <Bell color={color} size={size} />,
        }}
      />
      <Tab.Screen
        name="Settings"
        component={SettingsScreen}
        options={{
          tabBarIcon: ({ color, size }) => <SettingsIcon color={color} size={size} />,
        }}
      />
    </Tab.Navigator>
  );
}
