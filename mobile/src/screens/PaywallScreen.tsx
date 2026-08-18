/**
 * The paywall. Presented modally in exactly two ways: the navigator's
 * paywallBus subscription (a gated request came back ENTITLEMENT_REQUIRED)
 * and the Settings subscription row.
 *
 * Three rules shape this screen:
 *
 * 1. Guideline 3.1.2 requires the full offer stated before purchase: price per
 *    period, trial terms, auto-renewal disclosure, Privacy + Terms links, and
 *    a Restore Purchases button (its absence is a stock rejection). All of
 *    that is below — don't trim it for visual quiet.
 *
 * 2. Prices render from the store's own localized strings (offering packages),
 *    never hardcoded — hardcoded USD lies to most of the world and drifts the
 *    moment pricing changes in ASC.
 *
 * 3. The purchase completing is not the unlock. Apple → RevenueCat → webhook →
 *    hub.users.entitlement is the unlock, and this screen polls GET /auth/me
 *    until the server agrees (webhook lag is seconds, not ms). Dismissing on
 *    the SDK's say-so alone would bounce the user straight back here when the
 *    next gated call 403s.
 *
 * Coral stays the record affordance — the CTA here is the accent teal.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Linking, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import type { PurchasesOffering, PurchasesPackage } from 'react-native-purchases';
import {
  getCurrentOffering,
  isPurchasesConfigured,
  purchase,
  restorePurchases,
} from '../services/purchases';
import { apiService } from '../services/api';
import {
  AppScreen,
  AppHeader,
  AppButton,
  AppIconButton,
  AppText,
  useToast,
  Spacing,
  Radius,
} from '../components/ui';
import { Fonts, ThemeColors, useTheme, useThemedStyles } from '../theme';

type Nav = NativeStackNavigationProp<RootStackParamList, 'Paywall'>;

const FEATURES: Array<{ icon: keyof typeof Ionicons.glyphMap; text: string }> = [
  { icon: 'mic-outline', text: 'Unlimited voice notes, sorted for you' },
  { icon: 'location-outline', text: 'Reminders that fire when you arrive' },
  { icon: 'alarm-outline', text: 'Time reminders, accurate to the second' },
  { icon: 'sparkles-outline', text: 'Ask Offload anything you’ve captured' },
];

/**
 * Wait for the server to acknowledge the purchase (webhook lag). Returns true
 * once /auth/me reports an entitled state, false if it never showed up.
 */
async function waitForServerEntitlement(timeoutMs = 20000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const me = await apiService.getMe();
      const e = me.user.entitlement;
      if (e === 'trialing' || e === 'active' || e === 'grandfathered') return true;
    } catch {
      // transient — keep polling until the deadline
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  return false;
}

export default function PaywallScreen({ navigation }: { navigation: Nav }) {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const toast = useToast();

  const [offering, setOffering] = useState<PurchasesOffering | null>(null);
  const [loadingOffering, setLoadingOffering] = useState(true);
  const [selected, setSelected] = useState<'monthly' | 'annual'>('monthly');
  const [busy, setBusy] = useState<'purchase' | 'restore' | null>(null);

  useEffect(() => {
    let cancelled = false;
    getCurrentOffering()
      .then((o) => {
        if (!cancelled) setOffering(o);
      })
      .finally(() => {
        if (!cancelled) setLoadingOffering(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const monthly = offering?.monthly ?? null;
  const annual = offering?.annual ?? null;
  const selectedPkg: PurchasesPackage | null = selected === 'monthly' ? monthly : annual;

  const handlePurchase = useCallback(async () => {
    if (!selectedPkg || busy) return;
    setBusy('purchase');
    try {
      const outcome = await purchase(selectedPkg);
      if (outcome === 'cancelled') return;
      if (outcome === 'failed') {
        toast.show({ message: "Purchase didn't go through", description: 'Please try again.', tone: 'error' });
        return;
      }
      // Purchase succeeded at Apple — now wait for our server to hear it.
      const confirmed = await waitForServerEntitlement();
      if (confirmed) {
        toast.show({ message: 'Welcome to Offload Pro', tone: 'success' });
        navigation.goBack();
      } else {
        // Rare: webhook slower than our patience. The 24h server grace means
        // the next launch sorts it out; don't strand them on this screen.
        toast.show({
          message: 'Purchase received',
          description: 'Your subscription may take a minute to activate.',
        });
        navigation.goBack();
      }
    } finally {
      setBusy(null);
    }
  }, [selectedPkg, busy, toast, navigation]);

  const handleRestore = useCallback(async () => {
    if (busy) return;
    setBusy('restore');
    try {
      const ok = await restorePurchases();
      if (ok && (await waitForServerEntitlement(10000))) {
        toast.show({ message: 'Subscription restored', tone: 'success' });
        navigation.goBack();
      } else {
        toast.show({ message: 'No subscription to restore', description: 'Purchases made with this Apple ID will appear automatically.' });
      }
    } finally {
      setBusy(null);
    }
  }, [busy, toast, navigation]);

  const renderPackages = () => {
    if (loadingOffering) {
      return <ActivityIndicator color={colors.accent} style={styles.loading} />;
    }
    if (!isPurchasesConfigured() || (!monthly && !annual)) {
      return (
        <View style={styles.unavailable}>
          <AppText variant="body" color="muted" align="center">
            Subscriptions aren&rsquo;t available right now. Please try again later.
          </AppText>
        </View>
      );
    }
    return (
      <View style={styles.packages}>
        {monthly && (
          <PackageCard
            title="Monthly"
            price={`${monthly.product.priceString} / month`}
            badge={null}
            selected={selected === 'monthly'}
            onPress={() => setSelected('monthly')}
          />
        )}
        {annual && (
          <PackageCard
            title="Annual"
            price={`${annual.product.priceString} / year`}
            badge="2 months free"
            selected={selected === 'annual'}
            onPress={() => setSelected('annual')}
          />
        )}
      </View>
    );
  };

  const disclosure = selectedPkg
    ? `14 days free, then ${selectedPkg.product.priceString} per ${
        selected === 'monthly' ? 'month' : 'year'
      }. Auto-renews until cancelled — cancel anytime in your App Store settings.`
    : null;

  return (
    <AppScreen>
      <AppHeader
        title=""
        right={
          <AppIconButton icon="close" onPress={() => navigation.goBack()} accessibilityLabel="Close" />
        }
      />
      <ScrollView contentContainerStyle={styles.content}>
        <AppText variant="display" style={styles.title}>
          Offload Pro
        </AppText>
        <AppText variant="body" color="muted" style={styles.subtitle}>
          Say it once. It&rsquo;s handled.
        </AppText>

        <View style={styles.features}>
          {FEATURES.map((f) => (
            <View key={f.icon} style={styles.featureRow}>
              <Ionicons name={f.icon} size={18} color={colors.accent} />
              <AppText variant="body" style={styles.featureText}>
                {f.text}
              </AppText>
            </View>
          ))}
        </View>

        {renderPackages()}

        {selectedPkg && (
          <AppButton
            label={busy === 'purchase' ? 'One moment…' : 'Start 14 days free'}
            variant="accent"
            size="lg"
            onPress={handlePurchase}
            disabled={busy !== null}
            style={styles.cta}
          />
        )}

        {disclosure && (
          <AppText variant="secondary" color="faint" align="center" style={styles.disclosure}>
            {disclosure}
          </AppText>
        )}

        <AppButton
          label={busy === 'restore' ? 'Restoring…' : 'Restore Purchases'}
          variant="ghost"
          onPress={handleRestore}
          disabled={busy !== null}
          style={styles.restore}
        />

        <View style={styles.legal}>
          <TouchableOpacity onPress={() => Linking.openURL('https://useoffload.app/terms')}>
            <AppText variant="secondary" color="faint">
              Terms
            </AppText>
          </TouchableOpacity>
          <AppText variant="secondary" color="faint">
            {'  ·  '}
          </AppText>
          <TouchableOpacity onPress={() => Linking.openURL('https://useoffload.app/privacy')}>
            <AppText variant="secondary" color="faint">
              Privacy
            </AppText>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </AppScreen>
  );
}

function PackageCard({
  title,
  price,
  badge,
  selected,
  onPress,
}: {
  title: string;
  price: string;
  badge: string | null;
  selected: boolean;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  return (
    <TouchableOpacity
      style={[styles.card, selected && { borderColor: colors.accent, backgroundColor: colors.accentLight }]}
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
    >
      <View style={styles.cardText}>
        <AppText variant="heading">{title}</AppText>
        <AppText variant="secondary" color="muted">
          {price}
        </AppText>
      </View>
      {badge && (
        <View style={[styles.badge, { backgroundColor: colors.accent }]}>
          <AppText variant="label" style={styles.badgeText}>
            {badge}
          </AppText>
        </View>
      )}
      <Ionicons
        name={selected ? 'radio-button-on' : 'radio-button-off'}
        size={20}
        color={selected ? colors.accent : colors.borderStrong}
      />
    </TouchableOpacity>
  );
}

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
    content: { paddingHorizontal: Spacing.xl, paddingBottom: Spacing.xxl },
    title: { textAlign: 'center', marginTop: Spacing.md },
    subtitle: { textAlign: 'center', marginTop: Spacing.xs, marginBottom: Spacing.xl },
    features: { gap: Spacing.md, marginBottom: Spacing.xl },
    featureRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
    featureText: { flex: 1 },
    loading: { marginVertical: Spacing.xl },
    unavailable: { paddingVertical: Spacing.xl },
    packages: { gap: Spacing.md, marginBottom: Spacing.lg },
    card: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.md,
      borderWidth: 1.5,
      borderColor: c.border,
      borderRadius: Radius.lg,
      padding: Spacing.lg,
      backgroundColor: c.bgSurface,
    },
    cardText: { flex: 1, gap: 2 },
    badge: {
      borderRadius: Radius.full,
      paddingHorizontal: Spacing.sm,
      paddingVertical: 3,
    },
    badgeText: { color: '#FFFFFF' },
    cta: { marginTop: Spacing.sm },
    disclosure: { marginTop: Spacing.md, paddingHorizontal: Spacing.md },
    restore: { marginTop: Spacing.lg, alignSelf: 'center' },
    legal: {
      flexDirection: 'row',
      justifyContent: 'center',
      marginTop: Spacing.md,
    },
  });
