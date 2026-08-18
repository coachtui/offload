/**
 * Settings — the account surface the app previously had nowhere to put.
 *
 * Beyond being the obvious home for sign-out and the legal links, this screen
 * exists because App Store Guideline 5.1.1(v) requires an app that creates
 * accounts to offer account deletion from inside the app. The deletion itself
 * lives on its own screen; this is the entry point to it.
 */
import React, { useEffect, useState } from 'react';
import { Linking, ScrollView, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { useAuth } from '../context/AuthContext';
import { apiService } from '../services/api';
import {
  AppScreen,
  AppHeader,
  AppIconButton,
  AppText,
  ConfirmSheet,
  ListRow,
  Spacing,
} from '../components/ui';
import { ThemeColors, useTheme, useThemedStyles } from '../theme';

type Nav = NativeStackNavigationProp<RootStackParamList, 'Settings'>;

export default function SettingsScreen({ navigation }: { navigation: Nav }) {
  const { user, logout } = useAuth();
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const [logoutVisible, setLogoutVisible] = useState(false);

  // Entitlement is server-decided (see entitlementService in the backend), so
  // read it fresh rather than trusting whatever the login response cached.
  // null = still loading / unknown → the row shows nothing rather than a lie.
  const [entitlement, setEntitlement] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    apiService
      .getMe()
      .then((me) => {
        if (!cancelled) setEntitlement(me.user.entitlement ?? null);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const subscriptionRow = (() => {
    switch (entitlement) {
      case 'grandfathered':
        return { subtitle: 'Free forever — early supporter', onPress: undefined };
      case 'trialing':
        return {
          subtitle: 'Offload Pro — free trial',
          // Apple's own management page: cancel, switch plan, see renewal date.
          onPress: () => Linking.openURL('https://apps.apple.com/account/subscriptions'),
        };
      case 'active':
        return {
          subtitle: 'Offload Pro',
          onPress: () => Linking.openURL('https://apps.apple.com/account/subscriptions'),
        };
      case 'none':
        return { subtitle: 'Start your 14-day free trial', onPress: () => navigation.navigate('Paywall') };
      default:
        return null; // unknown — say nothing rather than something wrong
    }
  })();

  return (
    <AppScreen>
      <AppHeader
        title="Settings"
        left={
          <AppIconButton
            icon="chevron-back"
            onPress={() => navigation.goBack()}
            accessibilityLabel="Back"
          />
        }
      />

      <ScrollView contentContainerStyle={styles.content}>
        <Section title="Account">
          <ListRow title="Email" meta={user?.email ?? '—'} />
          {user?.name ? <ListRow title="Name" meta={user.name} /> : null}
          {subscriptionRow ? (
            <ListRow
              title="Subscription"
              subtitle={subscriptionRow.subtitle}
              onPress={subscriptionRow.onPress}
              showChevron={!!subscriptionRow.onPress}
            />
          ) : null}
        </Section>

        <Section title="Privacy">
          <ListRow
            title="Location & permissions"
            subtitle="What Offload can access on this phone"
            onPress={() => navigation.navigate('PermissionSettings')}
            showChevron
          />
          <ListRow
            title="Places"
            subtitle="Every place Offload watches for you"
            onPress={() => navigation.navigate('Places')}
            showChevron
          />
        </Section>

        <Section title="About">
          <ListRow
            title="How Offload works"
            subtitle="Talking naturally, places, times, Ask Offload, Insights"
            onPress={() => navigation.navigate('HowOffloadWorks')}
            showChevron
          />
        </Section>

        <Section title="Legal">
          <ListRow
            title="Privacy Policy"
            onPress={() => Linking.openURL('https://useoffload.app/privacy')}
            right={<Ionicons name="open-outline" size={15} color={colors.borderStrong} />}
          />
          <ListRow
            title="Terms of Service"
            onPress={() => Linking.openURL('https://useoffload.app/terms')}
            right={<Ionicons name="open-outline" size={15} color={colors.borderStrong} />}
          />
        </Section>

        <Section title="Danger zone">
          <ListRow
            title="Log out"
            subtitle="Your notes stay safely synced to your account"
            onPress={() => setLogoutVisible(true)}
          />
          <ListRow
            title="Delete account"
            subtitle="Permanently erase your account and everything in it"
            onPress={() => navigation.navigate('DeleteAccount')}
            right={<Ionicons name="chevron-forward" size={16} color={colors.error} />}
            style={styles.destructiveRow}
          />
        </Section>

        <AppText variant="secondary" color="faint" align="center" style={styles.copyright}>
          Offload © {new Date().getFullYear()} AIGA LLC
        </AppText>
      </ScrollView>

      <ConfirmSheet
        visible={logoutVisible}
        onClose={() => setLogoutVisible(false)}
        onConfirm={logout}
        title="Log out of Offload?"
        message="Your notes stay safely synced to your account."
        confirmLabel="Log out"
        destructive
      />
    </AppScreen>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const styles = useThemedStyles(createStyles);
  return (
    <View style={styles.section}>
      <AppText variant="secondary" color="muted" style={styles.sectionTitle}>
        {title}
      </AppText>
      {children}
    </View>
  );
}

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
    content: { paddingBottom: Spacing.xxl },
    section: { marginTop: Spacing.xl },
    sectionTitle: {
      paddingHorizontal: Spacing.xxl,
      marginBottom: Spacing.sm,
      textTransform: 'uppercase',
      letterSpacing: 0.6,
      fontSize: 11,
    },
    destructiveRow: { backgroundColor: c.bg },
    copyright: { marginTop: Spacing.xxl },
  });
