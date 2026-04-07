import {StatusBar} from 'expo-status-bar';
import {StyleSheet, Text, View} from 'react-native';
import {NavigationContainer} from '@react-navigation/native';
import {createNativeStackNavigator} from '@react-navigation/native-stack';
import SignUpScreen from './src/screens/SignUpScreen';
import SignInScreen from './src/screens/SignInScreen';
import QuizExperienceScreen from './src/screens/QuizExperienceScreen';
import QuizGoalsScreen from './src/screens/QuizGoalsScreen';
import QuizPlantsScreen from './src/screens/QuizPlantsScreen';

const Stack = createNativeStackNavigator();

export default function App() {
  return (
    <NavigationContainer>
      <Stack.Navigator>
        <Stack.Screen name="SignUp" component={SignUpScreen} />
        <Stack.Screen name="SignIn" component={SignInScreen} />
        <Stack.Screen name="QuizExperience" component={QuizExperienceScreen} />
        <Stack.Screen name="QuizGoals" component={QuizGoalsScreen} />
        <Stack.Screen name="QuizPlants" component={QuizPlantsScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}