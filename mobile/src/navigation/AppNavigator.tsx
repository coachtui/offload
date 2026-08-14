import React, { useState, useEffect } from 'react';
import { DefaultTheme, DarkTheme, NavigationContainer, Theme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useTheme } from '../theme';
import { useAuth } from '../context/AuthContext';
import { hasCompletedPermissionOnboarding } from '../services/permissionService';
import { shouldShowIntro } from '../services/educationService';
import {
  LoginScreen,
  RegisterScreen,
  PermissionsScreen,
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
import SettingsScreen from '../screens/SettingsScreen';
import PermissionSettingsScreen from '../screens/PermissionSettingsScreen';
import DeleteAccountScreen from '../screens/DeleteAccountScreen';
import IntroScreen from '../screens/IntroScreen';
import HowOffloadWorksScreen from '../screens/HowOffloadWorksScreen';
import { RootStackParamList } from './types';
import { navigationRef } from './navigationRef';
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

function MainStack({ initialRouteName }: { initialRouteName: 'Intro' | 'Permissions' | 'Home' }) {
  const { colors } = useTheme();
  return (
    <Stack.Navigator
      initialRouteName={initialRouteName}
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.bg },
      }}
    >
      {/* First-run intro (new signups only) — exits via its own Skip/Get started. */}
      <Stack.Screen name="Intro" component={IntroScreen} options={{ gestureEnabled: false }} />
      {/* Gesture-locked: the ladder is skippable via its own "Not right now",
          not by swiping back into an app with no permissions. */}
      <Stack.Screen
        name="Permissions"
        component={PermissionsScreen}
        options={{ gestureEnabled: false }}
      />
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
      <Stack.Screen name="Settings" component={SettingsScreen} options={{ headerShown: false }} />
      <Stack.Screen
        name="PermissionSettings"
        component={PermissionSettingsScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="DeleteAccount"
        component={DeleteAccountScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="HowOffloadWorks"
        component={HowOffloadWorksScreen}
        options={{ headerShown: false }}
      />
    </Stack.Navigator>
  );
}

export function AppNavigator() {
  const { isAuthenticated, isLoading } = useAuth();
  const { colors } = useTheme();
  const navTheme = useNavTheme();

  // Resolved before the main stack mounts so initialRouteName is correct on the
  // first render — React Navigation reads it once and ignores later changes.
  // `null` means "still reading", which is why it gates the spinner below.
  const [initialRoute, setInitialRoute] = useState<'Intro' | 'Permissions' | 'Home' | null>(null);

  useEffect(() => {
    if (!isAuthenticated) {
      // Re-arm for the next sign-in so a fresh account gets the ladder.
      setInitialRoute(null);
      return;
    }
    let cancelled = false;
    Promise.all([
      hasCompletedPermissionOnboarding(),
      // Fails closed inside educationService: a read error means no intro,
      // never a trapped user.
      shouldShowIntro(),
    ])
      .then(([permissionsDone, needsIntro]) => {
        if (cancelled) return;
        // Intro (new signups only) runs before the permission ladder — its
        // "places / times come back" framing is what makes the asks land.
        setInitialRoute(needsIntro ? 'Intro' : permissionsDone ? 'Home' : 'Permissions');
      })
      .catch(() => {
        // Can't read the flags — send them through the ladder. A second ask is
        // a far cheaper failure than an app that silently never works.
        if (!cancelled) setInitialRoute('Permissions');
      });
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated]);

  if (isLoading || (isAuthenticated && initialRoute === null)) {
    return (
      <View style={[styles.loading, { backgroundColor: colors.bg }]}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  return (
    <NavigationContainer ref={navigationRef} theme={navTheme}>
      {isAuthenticated ? (
        // Arrival alerts are no longer a banner over the app — Home renders the
        // place as a group in "For you right now" (see useProximityAlerts).
        <MainStack initialRouteName={initialRoute ?? 'Home'} />
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
