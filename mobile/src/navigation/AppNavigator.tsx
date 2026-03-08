import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useAuth } from '../context/AuthContext';
import {
  LoginScreen,
  RegisterScreen,
  HomeScreen,
  RecordScreen,
  SessionsScreen,
  ObjectsScreen,
} from '../screens';
import GeofencesScreen from '../screens/GeofencesScreen';
import CreateGeofenceScreen from '../screens/CreateGeofenceScreen';
import SearchScreen from '../screens/SearchScreen';
import AIQueryScreen from '../screens/AIQueryScreen';
import SynthesisScreen from '../screens/SynthesisScreen';
import ManageGeofenceObjectsScreen from '../screens/ManageGeofenceObjectsScreen';
import PlaceSummaryScreen from '../screens/PlaceSummaryScreen';
import { RootStackParamList } from './types';
import { navigationRef } from './navigationRef';
import { ActivityIndicator, View, StyleSheet } from 'react-native';

const Stack = createNativeStackNavigator<RootStackParamList>();

function AuthStack() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: '#FFFFFF' },
      }}
    >
      <Stack.Screen name="Login" component={LoginScreen} />
      <Stack.Screen name="Register" component={RegisterScreen} />
    </Stack.Navigator>
  );
}

function MainStack() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: '#F9FAFB' },
      }}
    >
      <Stack.Screen name="Home" component={HomeScreen} />
      <Stack.Screen name="Record" component={RecordScreen} />
      <Stack.Screen name="History" component={SessionsScreen} />
      <Stack.Screen name="Objects" component={ObjectsScreen} />
      <Stack.Screen name="Reminders" component={GeofencesScreen} />
      <Stack.Screen
        name="CreateGeofence"
        component={CreateGeofenceScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen name="Search" component={SearchScreen} />
      <Stack.Screen name="Chat" component={AIQueryScreen} />
      <Stack.Screen name="Insights" component={SynthesisScreen} />
      <Stack.Screen
        name="ManageGeofenceObjects"
        component={ManageGeofenceObjectsScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="PlaceSummary"
        component={PlaceSummaryScreen}
        options={{ headerShown: false }}
      />
    </Stack.Navigator>
  );
}

export function AppNavigator() {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color="#3b82f6" />
      </View>
    );
  }

  return (
    <NavigationContainer ref={navigationRef}>
      {isAuthenticated ? <MainStack /> : <AuthStack />}
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
  },
});
