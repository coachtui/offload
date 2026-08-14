/**
 * First-run introduction — three swipeable cards, shown exactly once, and only
 * to accounts created on this device (see educationService's new-signup gate).
 * Existing users signing in never land here.
 *
 * Runs BEFORE the permission ladder on purpose: "places you mention become
 * arrival reminders" is the sentence that makes the location ask on the next
 * screen make sense. Finishing (or skipping) marks the intro seen and replaces
 * to Permissions or Home depending on whether the ladder is still owed —
 * education must never add a second gate in front of the app.
 */

import React, { useRef, useState } from 'react';
import { FlatList, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { AppText, AppButton, AppPressable, Spacing, Radius } from '../components/ui';
import { ThemeColors, useTheme, useThemedStyles } from '../theme';
import { haptic } from '../theme/haptics';
import { setIntroSeen } from '../services/educationService';
import { hasCompletedPermissionOnboarding } from '../services/permissionService';

type Nav = NativeStackNavigationProp<RootStackParamList, 'Intro'>;

interface Props {
  navigation: Nav;
}

interface IntroPage {
  key: string;
  icon: keyof typeof Ionicons.glyphMap;
  render: (styles: ReturnType<typeof createStyles>) => React.ReactNode;
}

const PAGES: IntroPage[] = [
  {
    key: 'core',
    icon: 'mic',
    render: (styles) => (
      <>
        <AppText variant="display" align="center">
          Say it once.{'\n'}It's handled.
        </AppText>
        <AppText variant="body" color="muted" align="center" style={styles.lede}>
          Talk naturally. Mix errands, reminders, ideas, decisions, questions — anything — in one
          recording. Offload separates it and remembers what matters.
        </AppText>
        <View style={styles.exampleCard}>
          <AppText variant="body" color="secondary" style={styles.exampleText}>
            “Pick up chicken from Costco, call Mike tomorrow, and I want to rethink the budget for
            the project.”
          </AppText>
        </View>
        <AppText variant="heading" align="center" style={styles.keyLine}>
          You don't need to organize it first.
        </AppText>
      </>
    ),
  },
  {
    key: 'proactive',
    icon: 'navigate',
    render: (styles) => (
      <>
        <AppText variant="display" align="center">
          It comes back{'\n'}when it's useful.
        </AppText>
        <View style={styles.featureBlock}>
          <View style={styles.featureLabelRow}>
            <Ionicons name="location-outline" size={14} style={styles.featureIcon} />
            <AppText variant="label" color="muted">
              Places
            </AppText>
          </View>
          <View style={styles.exampleCard}>
            <AppText variant="body" color="secondary" style={styles.exampleText}>
              “Get batteries next time I'm at Home Depot.”
            </AppText>
          </View>
          <AppText variant="body" color="muted" style={styles.featureBody}>
            Mention where something belongs and Offload can remind you when you arrive. Checked on
            your phone — no continuous tracking.
          </AppText>
        </View>
        <View style={styles.featureBlock}>
          <View style={styles.featureLabelRow}>
            <Ionicons name="alarm-outline" size={14} style={styles.featureIcon} />
            <AppText variant="label" color="muted">
              Times
            </AppText>
          </View>
          <View style={styles.exampleCard}>
            <AppText variant="body" color="secondary" style={styles.exampleText}>
              “Remind me Tuesday at 3 to call the accountant.”
            </AppText>
          </View>
          <AppText variant="body" color="muted" style={styles.featureBody}>
            Mention a time naturally and Offload can turn it into a scheduled reminder. No forms to
            fill in.
          </AppText>
        </View>
      </>
    ),
  },
  {
    key: 'memory',
    icon: 'sparkles-outline',
    render: (styles) => (
      <>
        <AppText variant="display" align="center">
          Ask your memory.
        </AppText>
        <View style={styles.exampleCard}>
          <AppText variant="body" color="secondary" style={styles.exampleText}>
            “What did I promise Mike?”{'\n'}“What was that restaurant Sarah recommended?”
          </AppText>
        </View>
        <AppText variant="body" color="muted" align="center" style={styles.featureBody}>
          Ask Offload searches across what you've told it and answers from your own memories.
        </AppText>
        <View style={styles.insightsBlock}>
          <AppText variant="heading" align="center">
            Notice what you didn't.
          </AppText>
          <AppText variant="body" color="muted" align="center" style={styles.featureBody}>
            As your memory grows, Insights looks across what you've said and surfaces patterns,
            connections, and open threads you may not have noticed yourself. Insights get better as
            you use Offload.
          </AppText>
        </View>
      </>
    ),
  },
];

export default function IntroScreen({ navigation }: Props) {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const { width } = useWindowDimensions();
  const listRef = useRef<FlatList<IntroPage>>(null);
  const [page, setPage] = useState(0);
  const finishingRef = useRef(false);

  const isLast = page === PAGES.length - 1;

  async function finish() {
    if (finishingRef.current) return;
    finishingRef.current = true;
    console.log('[Education] intro completed');
    await setIntroSeen();
    const permissionsDone = await hasCompletedPermissionOnboarding().catch(() => false);
    navigation.replace(permissionsDone ? 'Home' : 'Permissions');
  }

  function handleContinue() {
    haptic.tap();
    if (isLast) {
      void finish();
    } else {
      listRef.current?.scrollToIndex({ index: page + 1, animated: true });
    }
  }

  function handleSkip() {
    haptic.tap();
    console.log('[Education] intro skipped');
    void finish();
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.topRow}>
        <View style={styles.topSpacer} />
        {!isLast ? (
          <AppPressable
            onPress={handleSkip}
            style={styles.skip}
            accessibilityRole="button"
            accessibilityLabel="Skip introduction"
          >
            <AppText variant="secondary" color="muted">
              Skip
            </AppText>
          </AppPressable>
        ) : null}
      </View>

      <FlatList
        ref={listRef}
        data={PAGES}
        keyExtractor={(p) => p.key}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={(e) => {
          setPage(Math.round(e.nativeEvent.contentOffset.x / width));
        }}
        renderItem={({ item }) => (
          // Each page scrolls vertically on its own so the copy stays readable
          // on the smallest supported iPhones instead of getting clipped.
          <ScrollView
            style={{ width }}
            contentContainerStyle={styles.page}
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.pageIcon}>
              <Ionicons name={item.icon} size={26} color={colors.accent} />
            </View>
            {item.render(styles)}
          </ScrollView>
        )}
      />

      <View style={styles.footer}>
        <View style={styles.dots} accessibilityLabel={`Page ${page + 1} of ${PAGES.length}`}>
          {PAGES.map((p, i) => (
            <View key={p.key} style={[styles.dot, i === page && styles.dotActive]} />
          ))}
        </View>
        <AppButton
          label={isLast ? 'Get started' : 'Continue'}
          onPress={handleContinue}
          size="lg"
          style={styles.cta}
        />
      </View>
    </SafeAreaView>
  );
}

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: c.bg },
    topRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: Spacing.xxl,
      minHeight: 44,
    },
    topSpacer: { width: 44 },
    skip: { paddingVertical: Spacing.md, paddingHorizontal: Spacing.sm },
    page: {
      paddingHorizontal: Spacing.xxl + Spacing.sm,
      paddingTop: Spacing.xl,
      paddingBottom: Spacing.xl,
      alignItems: 'stretch',
    },
    pageIcon: {
      alignSelf: 'center',
      width: 56,
      height: 56,
      borderRadius: Radius.lg,
      backgroundColor: c.accentLight,
      borderWidth: 1,
      borderColor: c.accentBorder,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: Spacing.xxl,
    },
    lede: { marginTop: Spacing.lg },
    exampleCard: {
      backgroundColor: c.bgSurface,
      borderRadius: Radius.md,
      borderWidth: 1,
      borderColor: c.border,
      padding: Spacing.lg,
      marginTop: Spacing.xl,
    },
    exampleText: { fontStyle: 'italic', lineHeight: 23 },
    keyLine: { marginTop: Spacing.xxl },
    featureBlock: { marginTop: Spacing.xxl },
    featureLabelRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    featureIcon: { color: c.textMuted },
    featureBody: { marginTop: Spacing.md },
    insightsBlock: { marginTop: Spacing.xxxl },
    footer: {
      paddingHorizontal: Spacing.xxl,
      paddingTop: Spacing.lg,
      paddingBottom: Spacing.sm,
    },
    dots: {
      flexDirection: 'row',
      justifyContent: 'center',
      gap: Spacing.sm,
      marginBottom: Spacing.xl,
    },
    dot: {
      width: 7,
      height: 7,
      borderRadius: Radius.full,
      backgroundColor: c.borderStrong,
    },
    dotActive: { backgroundColor: c.accent, width: 18 },
    cta: { width: '100%' },
  });
