import { StatusBar } from 'expo-status-bar';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Home, Bell, Settings as SettingsIcon } from 'lucide-react-native';
import HomeScreen from './src/screens/HomeScreen';
import PlantDetailScreen from './src/screens/PlantDetailScreen';
import AlertsScreen from './src/screens/AlertsScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import { colors } from './src/constants/theme';

const PlantsStack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

function PlantsStackNavigator() {
  return (
    <PlantsStack.Navigator screenOptions={{ headerShown: false }}>
      <PlantsStack.Screen name="Home" component={HomeScreen} />
      <PlantsStack.Screen name="PlantDetail" component={PlantDetailScreen} />
    </PlantsStack.Navigator>
  );
}

export default function App() {
  return (
    <NavigationContainer>
      <Tab.Navigator
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: colors.primary,
          tabBarInactiveTintColor: colors.textSecondary,
          tabBarStyle: {
            backgroundColor: colors.surface,
            borderTopColor: colors.border,
            height: 64,
            paddingBottom: 8,
            paddingTop: 8,
          },
          tabBarLabelStyle: { fontSize: 12, fontWeight: '600' },
        }}
      >
        <Tab.Screen
          name="MyPlants"
          component={PlantsStackNavigator}
          options={{
            title: 'My Plants',
            tabBarIcon: ({ color, size }) => (
              <Home size={size} color={color} strokeWidth={2} />
            ),
          }}
        />
        <Tab.Screen
          name="Alerts"
          component={AlertsScreen}
          options={{
            tabBarIcon: ({ color, size }) => (
              <Bell size={size} color={color} strokeWidth={2} />
            ),
          }}
        />
        <Tab.Screen
          name="Settings"
          component={SettingsScreen}
          options={{
            tabBarIcon: ({ color, size }) => (
              <SettingsIcon size={size} color={color} strokeWidth={2} />
            ),
          }}
        />
      </Tab.Navigator>
      <StatusBar style="auto" />
    </NavigationContainer>
  );
}
