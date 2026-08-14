/**
 * How Offload works — the permanent, revisitable version of everything the
 * one-shot education moments teach. Reached from Settings → About and from the
 * Record screen's "Try saying…" sheet.
 *
 * Education and permission requests are separate concerns: this screen shows
 * the CURRENT permission state for arrival reminders and routes to the
 * existing PermissionSettings flow, but never fires an OS permission dialog
 * itself — the contextual ladder (PermissionsScreen / ArrivalPermissionSheet)
 * stays the only place that spends those asks.
 */

import React from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { usePermissionStatus } from '../hooks/usePermissionStatus';
import { canDeliverArrivalReminders } from '../services/permissionService';
import {
  AppScreen,
  AppHeader,
  AppIconButton,
  AppText,
  AppButton,
  AppPressable,
  Spacing,
  Radius,
} from '../components/ui';
import { ThemeColors, useTheme, useThemedStyles } from '../theme';

type Nav = NativeStackNavigationProp<RootStackParamList, 'HowOffloadWorks'>;

const ASK_EXAMPLES = [
  'What did I promise Justin?',
  'What have I said about this project?',
  'What decisions have I made recently?',
  'What have I been putting off?',
  'What did I say about Costco?',
];

export default function HowOffloadWorksScreen({ navigation }: { navigation: Nav }) {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const { status, loading } = usePermissionStatus();
  const arrivalsReady = canDeliverArrivalReminders(status);

  return (
    <AppScreen>
      <AppHeader
        title="How Offload works"
        left={
          <AppIconButton
            icon="chevron-back"
            onPress={() => navigation.goBack()}
            accessibilityLabel="Back"
          />
        }
      />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Hero */}
        <AppText variant="title">Say it once. It's handled.</AppText>
        <AppText variant="body" color="muted" style={styles.heroBody}>
          Offload is a memory you talk to. One recording can hold a dozen unrelated thoughts —
          Offload separates them, remembers them, and brings each one back at the moment it's
          useful.
        </AppText>

        {/* Talk naturally */}
        <Module icon="mic-outline" title="Talk naturally">
          <Utterance text="“Get detergent from Target, call Steve tomorrow, and I think we should reconsider the proposal.”" />
          <Utterance text="“My knee hurt after today's run, remind me to email John, and I really liked that restaurant Sarah picked.”" />
          <AppText variant="body" color="secondary" style={styles.moduleKeyLine}>
            Change subjects. Ramble. You don't need to organize anything first.
          </AppText>
        </Module>

        {/* Places */}
        <Module icon="location-outline" title="Places">
          <Utterance text="“Get paper towels next time I'm at Costco.”" />
          <Utterance text="“Remind me about the drill bits when I get to Home Depot.”" />
          <Utterance text="“I need to return this when I'm near Target.”" />
          <AppText variant="body" color="muted" style={styles.moduleBody}>
            Offload recognizes places you mention and can bring the memory back when you arrive.
            Arrivals are detected on your phone — there's no continuous tracking and no history of
            where you've been.
          </AppText>
          {!loading ? (
            <View style={[styles.statusRow, arrivalsReady ? styles.statusOk : styles.statusOff]}>
              <Ionicons
                name={arrivalsReady ? 'checkmark-circle' : 'alert-circle-outline'}
                size={16}
                color={arrivalsReady ? colors.success : colors.warning}
              />
              <AppText variant="secondary" color="muted" style={styles.statusText}>
                {arrivalsReady
                  ? 'Arrival reminders are on.'
                  : 'Arrival reminders are off — Offload is missing a location or notification permission.'}
              </AppText>
            </View>
          ) : null}
          {!loading && !arrivalsReady ? (
            <AppButton
              label="Review permissions"
              variant="secondary"
              size="sm"
              icon="settings-outline"
              onPress={() => navigation.navigate('PermissionSettings')}
              style={styles.statusAction}
            />
          ) : null}
        </Module>

        {/* Time reminders */}
        <Module icon="alarm-outline" title="Time reminders">
          <Utterance text="“Call the accountant Tuesday at 3.”" />
          <Utterance text="“Remind me Friday morning to send that report.”" />
          <Utterance text="“I need to renew this next month.”" />
          <AppText variant="body" color="muted" style={styles.moduleBody}>
            Mention a time the way you'd say it to a person and Offload can turn it into a
            scheduled reminder. No date pickers, no forms.
          </AppText>
        </Module>

        {/* Ask Offload */}
        <Module icon="chatbubble-outline" title="Ask Offload">
          <AppText variant="body" color="muted" style={styles.moduleLead}>
            Not a generic chatbot — Ask Offload searches across what you've told it and answers
            from your own memories. Try one:
          </AppText>
          {ASK_EXAMPLES.map((q) => (
            <AppPressable
              key={q}
              scale={false}
              style={styles.askRow}
              onPress={() => navigation.navigate('AskOffload', { initialQuery: q })}
              accessibilityRole="button"
              accessibilityLabel={`Ask Offload: ${q}`}
            >
              <AppText variant="body" color="accent" style={styles.askText}>
                {q}
              </AppText>
              <Ionicons name="arrow-forward" size={15} color={colors.accent} />
            </AppPressable>
          ))}
        </Module>

        {/* Insights */}
        <Module icon="bar-chart-outline" title="Insights">
          <AppText variant="heading" style={styles.insightsHeadline}>
            Your memories become more useful together.
          </AppText>
          <AppText variant="body" color="muted" style={styles.moduleBody}>
            Insights doesn't just summarize individual notes. It periodically looks across
            everything you've told Offload and surfaces patterns, connections, recurring concerns,
            unfinished threads, decisions worth revisiting, and observations that may connect
            across different parts of your life.
          </AppText>
          <View style={styles.insightsExamples}>
            {[
              'A concern that keeps appearing over several weeks',
              'A work idea that connects to something from a personal project',
              'A commitment that keeps resurfacing but never gets resolved',
              "A shift in how you've been talking about a decision",
            ].map((line) => (
              <View key={line} style={styles.insightsExampleRow}>
                <View style={styles.insightsDot} />
                <AppText variant="secondary" color="muted" style={styles.insightsExampleText}>
                  {line}
                </AppText>
              </View>
            ))}
          </View>
          <AppText variant="body" color="muted" style={styles.moduleBody}>
            Insights improve as Offload learns from more of what you choose to save — a brand-new
            account won't see much yet, and that's expected.
          </AppText>
          <AppButton
            label="Open Insights"
            variant="accent"
            icon="bar-chart-outline"
            onPress={() => navigation.navigate('Insights')}
            style={styles.insightsCta}
          />
        </Module>

        <AppText variant="secondary" color="faint" align="center" style={styles.footerLine}>
          Just talk. Offload handles the structure.
        </AppText>
      </ScrollView>
    </AppScreen>
  );
}

function Module({
  icon,
  title,
  children,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  children: React.ReactNode;
}) {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  return (
    <View style={styles.module}>
      <View style={styles.moduleHeader}>
        <View style={styles.moduleIcon}>
          <Ionicons name={icon} size={17} color={colors.accent} />
        </View>
        <AppText variant="heading" accessibilityRole="header">
          {title}
        </AppText>
      </View>
      {children}
    </View>
  );
}

function Utterance({ text }: { text: string }) {
  const styles = useThemedStyles(createStyles);
  return (
    <View style={styles.utterance}>
      <AppText variant="body" color="secondary" style={styles.utteranceText}>
        {text}
      </AppText>
    </View>
  );
}

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
    content: {
      paddingHorizontal: Spacing.xxl,
      paddingTop: Spacing.xl,
      paddingBottom: Spacing.xxxl,
    },
    heroBody: { marginTop: Spacing.sm },
    module: {
      marginTop: Spacing.xxxl,
    },
    moduleHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.md,
      marginBottom: Spacing.md,
    },
    moduleIcon: {
      width: 32,
      height: 32,
      borderRadius: Radius.sm,
      backgroundColor: c.accentLight,
      alignItems: 'center',
      justifyContent: 'center',
    },
    moduleLead: { marginBottom: Spacing.md },
    moduleBody: { marginTop: Spacing.md },
    moduleKeyLine: { marginTop: Spacing.md, fontStyle: 'normal' },
    utterance: {
      backgroundColor: c.bgSurface,
      borderRadius: Radius.md,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: c.border,
      paddingHorizontal: Spacing.lg,
      paddingVertical: Spacing.md,
      marginTop: Spacing.sm,
    },
    utteranceText: { fontStyle: 'italic', lineHeight: 21 },
    statusRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: Spacing.sm,
      borderRadius: Radius.md,
      borderWidth: 1,
      padding: Spacing.md,
      marginTop: Spacing.md,
    },
    statusOk: { backgroundColor: c.successBg, borderColor: c.successBorder },
    statusOff: { backgroundColor: c.warningBg, borderColor: c.warningBorder },
    statusText: { flex: 1 },
    statusAction: { alignSelf: 'flex-start', marginTop: Spacing.md },
    askRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: c.bgSurface,
      borderRadius: Radius.md,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: c.border,
      paddingHorizontal: Spacing.lg,
      paddingVertical: Spacing.md,
      marginTop: Spacing.sm,
      gap: Spacing.sm,
    },
    askText: { flex: 1 },
    insightsHeadline: { marginBottom: 2 },
    insightsExamples: { marginTop: Spacing.md, gap: Spacing.sm },
    insightsExampleRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: Spacing.md,
    },
    insightsDot: {
      width: 5,
      height: 5,
      borderRadius: Radius.full,
      backgroundColor: c.accent,
      marginTop: 6,
    },
    insightsExampleText: { flex: 1 },
    insightsCta: { alignSelf: 'flex-start', marginTop: Spacing.lg },
    footerLine: { marginTop: Spacing.xxxl },
  });
