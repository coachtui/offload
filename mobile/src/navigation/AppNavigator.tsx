import React from 'react';
import { DefaultTheme, DarkTheme, NavigationContainer, Theme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useTheme } from '../theme';
import { useAuth } from '../context/AuthContext';
import {
  LoginScreen,
  RegisterScreen,
  HomeScreen,
  RecordScreen,
  ObjectsScreen,
} from '../screens';
import CreateGeofenceScreen from '../screens/CreateGeofenceScreen';
import AIQueryScreen from '../screens/AIQueryScreen';
import SynthesisScreen from '../screens/SynthesisScreen';
import ManageGeofenceObjectsScreen from '../screens/ManageGeofenceObjectsScreen';
import EditGeofenceScreen from '../screens/EditGeofenceScreen';
import PlaceSummaryScreen from '../screens/PlaceSummaryScreen';
import PlacesScreen from '../screens/PlacesScreen';
import CategoriesScreen from '../screens/CategoriesScreen';
import { RootStackParamList } from './types';
import { navigationRef } from './navigationRef';
import { ProximityBanner } from '../components/ProximityBanner';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { ActivityIndicator, View, StyleSheet } from 'react-native';

const Stack = createNativeStackNavigator<RootStackParamList>();

function useNavTheme(): Theme {
  const { colors, scheme } = useTheme();
  const base = scheme === 'dark' ? DarkTheme : DefaultTheme;
  return {
    ...base,
    colors: {
      ...base.colors,
      primary: colors.accent,
      background: colors.bg,
      card: colors.bgSurface,
      text: colors.text,
      border: colors.border,
    },
  };
}

function AuthStack() {
  const { colors } = useTheme();
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.bg },
      }}
    >
      <Stack.Screen name="Login" component={LoginScreen} />
      <Stack.Screen name="Register" component={RegisterScreen} />
    </Stack.Navigator>
  );
}

function MainStack() {
  const { colors } = useTheme();
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.bg },
      }}
    >
      <Stack.Screen name="Home" component={HomeScreen} />
      <Stack.Screen
        name="Record"
        component={RecordScreen}
        options={{ presentation: 'fullScreenModal', animation: 'fade_from_bottom' }}
      />
      <Stack.Screen name="Objects" component={ObjectsScreen} />
      <Stack.Screen name="Places" component={PlacesScreen} />
      <Stack.Screen
        name="CreateGeofence"
        component={CreateGeofenceScreen}
        options={{ headerShown: false, presentation: 'modal' }}
      />
      <Stack.Screen name="AskOffload" component={AIQueryScreen} />
      <Stack.Screen name="Insights" component={SynthesisScreen} />
      <Stack.Screen
        name="ManageGeofenceObjects"
        component={ManageGeofenceObjectsScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="EditGeofence"
        component={EditGeofenceScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="PlaceSummary"
        component={PlaceSummaryScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen name="Categories" component={CategoriesScreen} />
    </Stack.Navigator>
  );
}

export function AppNavigator() {
  const { isAuthenticated, isLoading } = useAuth();
  const { colors } = useTheme();
  const navTheme = useNavTheme();

  if (isLoading) {
    return (
      <View style={[styles.loading, { backgroundColor: colors.bg }]}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  return (
    <NavigationContainer ref={navigationRef} theme={navTheme}>
      {isAuthenticated ? (
        <>
          <MainStack />
          <ErrorBoundary label="ProximityBanner">
            <ProximityBanner />
          </ErrorBoundary>
        </>
      ) : (
        <AuthStack />
      )}
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
