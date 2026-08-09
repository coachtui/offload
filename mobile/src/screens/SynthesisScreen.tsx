/**
 * InsightsScreen — weekly cross-domain reflection
 * Shows the latest AI-generated synthesis and lets the user trigger a new one.
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  RefreshControl,
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { apiService, WeeklySynthesis, SynthesisRef, DormantIdea } from '../services/api';
import { updateNoteState, reviewDecision } from '../services/noteLifecycle';
import { AtomicObject } from '../types';
import { Spacing, SkeletonCard, useToast } from '../components/ui';
import { Fonts, Type, Radius, Elevation, ThemeColors, useTheme, useThemedStyles } from '../theme';

// ─── Section identity hues ────────────────────────────────────────────────────
// Harmonized with the Deep Lagoon palette. Chip bg = hue at ~12% alpha ('1F'),
// icon + bullet dots = hue at full strength.

const SECTION_HUES: Record<string, string> = {
  'book-outline': '#2C6E8F',
  'trophy-outline': '#A1740C',
  'repeat-outline': '#7A5FB0',
  'git-network-outline': '#0F6B5F',
  'checkmark-circle-outline': '#1E7B54',
  'flash-outline': '#C2492F',
  'bulb-outline': '#A1740C',
  'scale-outline': '#2C6E8F',
  'calendar-outline': '#5F6B66',
  'link-outline': '#0F6B5F',
};

const hueFor = (icon: string): string => SECTION_HUES[icon] ?? '#5F6B66';

interface SynthesisScreenProps {
  navigation: any;
}

export default function SynthesisScreen({ navigation }: SynthesisScreenProps) {
  const styles = useThemedStyles(createStyles);
  const { colors } = useTheme();
  const toast = useToast();
  const [synthesis, setSynthesis] = useState<WeeklySynthesis | null>(null);
  const [history, setHistory] = useState<WeeklySynthesis[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Dormant ideas
  const [dormantIdeas, setDormantIdeas] = useState<DormantIdea[]>([]);
  const [dormantLoading, setDormantLoading] = useState(false);
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());

  // Decision reviews
  const [pendingDecisions, setPendingDecisions] = useState<AtomicObject[]>([]);
  const [decisionReviewText, setDecisionReviewText] = useState<Record<string, string>>({});
  const [submittedDecisions, setSubmittedDecisions] = useState<Set<string>>(new Set());

  const loadHistory = useCallback(async () => {
    try {
      const { syntheses } = await apiService.getSyntheses();
      setHistory(syntheses);
      if (syntheses.length > 0) setSynthesis(syntheses[0]);
    } catch (err: any) {
      setError(err.message || 'Failed to load insights');
    }
  }, []);

  useEffect(() => {
    loadHistory().finally(() => setLoading(false));
    // Load dormant ideas
    setDormantLoading(true);
    apiService.getDormantIdeas({ limit: 5, dormantDays: 14 })
      .then(({ ideas }) => setDormantIdeas(ideas))
      .catch(() => {})
      .finally(() => setDormantLoading(false));
    // Load pending decisions
    apiService.getObjects({ objectType: ['decision'], limit: 5 })
      .then(({ objects }) => {
        const pending = objects.filter((o: any) =>
          o.objectType === 'decision' && (!o.state || o.state === 'open' || o.state === 'active')
        );
        setPendingDecisions(pending);
      })
      .catch(() => {});
  }, [loadHistory]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadHistory();
    setRefreshing(false);
  }, [loadHistory]);

  const handleGenerate = useCallback(
    async (force = false) => {
      setGenerating(true);
      setError(null);
      try {
        const { synthesis: result } = await apiService.triggerWeeklySynthesis({ force });
        setSynthesis(result);
        const { syntheses } = await apiService.getSyntheses();
        setHistory(syntheses);
      } catch (err: any) {
        const msg = err.message || 'Failed to generate insights';
        setError(msg);
        toast.show({ message: "Couldn't generate insights", description: msg, tone: 'error' });
      } finally {
        setGenerating(false);
      }
    },
    [toast]
  );

  const handleArchiveIdea = useCallback(async (id: string) => {
    try {
      await updateNoteState(id, 'archived');
      setDismissedIds((prev) => new Set([...prev, id]));
    } catch { /* silent */ }
  }, []);

  const handleReviewDecision = useCallback(async (id: string) => {
    const outcome = decisionReviewText[id];
    if (!outcome?.trim()) return;
    try {
      await reviewDecision(id, outcome.trim());
      setSubmittedDecisions((prev) => new Set([...prev, id]));
    } catch { /* silent */ }
  }, [decisionReviewText]);

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString('en-US', {
      weekday: 'short', month: 'short', day: 'numeric',
    });

  const formatPeriod = (s: WeeklySynthesis) =>
    `${formatDate(s.periodStart)} – ${formatDate(s.periodEnd)}`;

  // ─── Empty state ──────────────────────────────────────────────────────────

  if (!loading && !synthesis) {
    return (
      <SafeAreaView style={styles.container}>
        <Header navigation={navigation} />
        <View style={styles.emptyState}>
          <Ionicons
            name="sparkles-outline"
            size={48}
            color={colors.borderStrong}
            style={styles.emptyIcon}
          />
          <Text style={styles.emptyTitle}>No insights yet</Text>
          <Text style={styles.emptySubtitle}>
            Generate your first weekly insights to see patterns across your notes.
          </Text>
          <TouchableOpacity
            style={styles.generateButton}
            onPress={() => handleGenerate(false)}
            disabled={generating}
          >
            {generating ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.generateButtonText}>Generate This Week's Insights</Text>
            )}
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // ─── Loading ──────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <Header navigation={navigation} />
        <View style={styles.scrollContent}>
          <SkeletonCard lines={3} />
          <SkeletonCard lines={2} style={styles.skeletonGap} />
          <SkeletonCard lines={2} style={styles.skeletonGap} />
        </View>
      </SafeAreaView>
    );
  }

  // ─── Main view ────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={styles.container}>
      <Header navigation={navigation} />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={colors.accent}
          />
        }
      >
        {/* Hero summary card */}
        <View style={styles.heroCard}>
          <View style={styles.heroRow}>
            <View style={styles.heroChip}>
              <Ionicons name="sparkles" size={20} color="#FFFFFF" />
            </View>
            <View style={styles.heroTextBlock}>
              <Text style={styles.heroLabel}>Weekly synthesis</Text>
              <Text style={styles.heroTitle} accessibilityRole="header">
                {synthesis
                  ? `Week of ${formatDate(synthesis.periodStart)}`
                  : 'Patterns from your week'}
              </Text>
            </View>
            <TouchableOpacity
              style={[styles.regenButton, generating && styles.regenButtonDisabled]}
              onPress={() => handleGenerate(true)}
              disabled={generating}
              accessibilityRole="button"
              accessibilityLabel="Refresh insights"
              accessibilityState={{ disabled: generating }}
            >
              {generating ? (
                <ActivityIndicator color={colors.accent} size="small" />
              ) : (
                <>
                  <Ionicons name="refresh" size={14} color={colors.accent} />
                  <Text style={styles.regenButtonText}>Refresh</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
          {synthesis && (
            <Text style={styles.heroMeta}>
              {formatPeriod(synthesis)} · {synthesis.objectCount ?? 0} notes analysed
            </Text>
          )}
        </View>

        {synthesis && (
          <>
            {/* Domain breakdown */}
            {Object.keys(synthesis.domainBreakdown).length > 0 && (
              <View style={styles.domainsRow}>
                {Object.entries(synthesis.domainBreakdown)
                  .sort((a, b) => b[1] - a[1])
                  .map(([domain, count]) => (
                    <View key={domain} style={styles.domainChip}>
                      <Text style={styles.domainChipText}>
                        {domain} {count}
                      </Text>
                    </View>
                  ))}
              </View>
            )}

            {/* Narrative */}
            <Section title="This Week" icon="book-outline">
              {synthesis.narrative
                .split(/\n\n+/)
                .map((para, i) => (
                  <Text key={i} style={[styles.narrative, i > 0 && styles.narrativeParagraph]}>
                    {para.trim()}
                  </Text>
                ))}
            </Section>

            {/* Accomplished */}
            {synthesis.accomplished && synthesis.accomplished.length > 0 && (
              <Section title="Accomplished" icon="trophy-outline">
                <BulletList items={synthesis.accomplished} color={hueFor('trophy-outline')} />
              </Section>
            )}

            {/* Patterns */}
            {synthesis.patterns.length > 0 && (
              <Section title="Patterns" icon="repeat-outline">
                <BulletList items={synthesis.patterns} color={hueFor('repeat-outline')} />
              </Section>
            )}

            {/* Open threads */}
            {synthesis.openThreads.length > 0 && (
              <Section title="Open Threads" icon="git-network-outline">
                <BulletList items={synthesis.openThreads} color={hueFor('git-network-outline')} />
              </Section>
            )}

            {/* Action items */}
            {synthesis.actionableInsights.length > 0 && (
              <Section title="Action Items" icon="checkmark-circle-outline">
                <BulletList items={synthesis.actionableInsights} color={hueFor('checkmark-circle-outline')} />
              </Section>
            )}

            {/* Contradictions */}
            {synthesis.contradictions.length > 0 && (
              <Section title="Contradictions" icon="flash-outline">
                <BulletList items={synthesis.contradictions} color={hueFor('flash-outline')} />
              </Section>
            )}

            {/* Cited Notes — collapsible */}
            {synthesis.citedObjects && synthesis.citedObjects.length > 0 && (
              <CollapsibleCitedNotes refs={synthesis.citedObjects} />
            )}

            {/* Revisit — dormant ideas */}
            {(dormantLoading || dormantIdeas.filter(i => !dismissedIds.has(i.id)).length > 0) && (
              <Section title="Revisit" icon="bulb-outline">
                {dormantLoading ? (
                  <ActivityIndicator size="small" color={colors.accent} />
                ) : (
                  dormantIdeas
                    .filter((idea) => !dismissedIds.has(idea.id))
                    .map((idea) => (
                      <TouchableOpacity
                        key={idea.id}
                        style={styles.dormantCard}
                        onPress={() => navigation.navigate('Objects', { objectId: idea.id })}
                        activeOpacity={0.75}
                      >
                        <View style={styles.dormantCardHeader}>
                          <Text style={styles.dormantAge}>{idea.daysDormant}d dormant</Text>
                          <TouchableOpacity
                            onPress={(e) => { e.stopPropagation(); handleArchiveIdea(idea.id); }}
                            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                          >
                            <Text style={styles.dormantArchive}>Archive</Text>
                          </TouchableOpacity>
                        </View>
                        <Text style={styles.dormantText} numberOfLines={3}>
                          {idea.title || idea.cleanedText}
                        </Text>
                        {idea.mentionCount > 0 && (
                          <Text style={styles.dormantMention}>Referenced {idea.mentionCount}× in past</Text>
                        )}
                      </TouchableOpacity>
                    ))
                )}
              </Section>
            )}

            {/* Decision Reviews */}
            {pendingDecisions.filter(d => !submittedDecisions.has(d.id)).length > 0 && (
              <Section title="Decision Reviews" icon="scale-outline">
                {pendingDecisions
                  .filter((d) => !submittedDecisions.has(d.id))
                  .map((decision) => (
                    <View key={decision.id} style={styles.decisionCard}>
                      <Text style={styles.decisionText} numberOfLines={2}>
                        {decision.title || decision.content}
                      </Text>
                      <TextInput
                        style={styles.decisionInput}
                        placeholder="How did this turn out?"
                        placeholderTextColor={colors.textFaint}
                        value={decisionReviewText[decision.id] ?? ''}
                        onChangeText={(text) =>
                          setDecisionReviewText((prev) => ({ ...prev, [decision.id]: text }))
                        }
                      />
                      <TouchableOpacity
                        style={[
                          styles.decisionSubmit,
                          !decisionReviewText[decision.id]?.trim() && styles.decisionSubmitDisabled,
                        ]}
                        onPress={() => handleReviewDecision(decision.id)}
                        disabled={!decisionReviewText[decision.id]?.trim()}
                      >
                        <Text style={styles.decisionSubmitText}>Record Outcome</Text>
                      </TouchableOpacity>
                    </View>
                  ))}
              </Section>
            )}

            {/* Past syntheses */}
            {history.length > 1 && (
              <Section title="Previous" icon="calendar-outline">
                {history.slice(1).map((s) => (
                  <TouchableOpacity
                    key={s.sessionId}
                    style={styles.historyItem}
                    onPress={() => setSynthesis(s)}
                  >
                    <Text style={styles.historyDate}>{formatPeriod(s)}</Text>
                    <Text style={styles.historyCount}>{s.objectCount} notes</Text>
                  </TouchableOpacity>
                ))}
              </Section>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function Header({ navigation }: { navigation: any }) {
  const styles = useThemedStyles(createStyles);
  const { colors } = useTheme();
  return (
    <View style={styles.header}>
      <TouchableOpacity
        onPress={() => navigation.goBack()}
        accessibilityRole="button"
        accessibilityLabel="Back"
      >
        <Ionicons name="arrow-back" size={24} color={colors.textSecondary} />
      </TouchableOpacity>
      <Text style={styles.headerTitle}>Insights</Text>
      <View style={{ width: 24 }} />
    </View>
  );
}

function Section({
  title,
  icon,
  hue,
  children,
}: {
  title: string;
  icon: keyof typeof Ionicons.glyphMap;
  hue?: string;
  children: React.ReactNode;
}) {
  const styles = useThemedStyles(createStyles);
  const sectionHue = hue ?? hueFor(icon);
  return (
    <View style={styles.section}>
      <View style={styles.sectionTitleRow}>
        <View style={[styles.sectionIconChip, { backgroundColor: sectionHue + '1F' }]}>
          <Ionicons name={icon} size={16} color={sectionHue} />
        </View>
        <Text style={styles.sectionTitle} accessibilityRole="header">
          {title}
        </Text>
      </View>
      {children}
    </View>
  );
}

function CollapsibleCitedNotes({ refs }: { refs: SynthesisRef[] }) {
  const styles = useThemedStyles(createStyles);
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);
  return (
    <View style={styles.section}>
      <TouchableOpacity
        style={styles.collapsibleHeader}
        onPress={() => setOpen((o) => !o)}
        accessibilityState={{ expanded: open }}
      >
        <View style={[styles.sectionTitleRow, { marginBottom: 0 }]}>
          <View style={[styles.sectionIconChip, { backgroundColor: hueFor('link-outline') + '1F' }]}>
            <Ionicons name="link-outline" size={16} color={hueFor('link-outline')} />
          </View>
          <Text style={styles.sectionTitle} accessibilityRole="header">
            Sources ({refs.length})
          </Text>
        </View>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={16} color={colors.textFaint} />
      </TouchableOpacity>
      {open && <CitedNotes refs={refs} />}
    </View>
  );
}

function CitedNotes({ refs }: { refs: SynthesisRef[] }) {
  const styles = useThemedStyles(createStyles);
  // Category hues harmonized with the Deep Lagoon palette (see ObjectsScreen)
  const DOMAIN_COLORS: Record<string, string> = {
    work: '#2C6E8F',
    personal: '#7A5FB0',
    health: '#1E7B54',
    family: '#A1740C',
    finance: '#0F6B5F',
    project: '#B0508A',
    misc: '#5F6B66',
    unknown: '#5F6B66',
  };
  const TYPE_LABELS: Record<string, string> = {
    task: 'Task', reminder: 'Reminder', idea: 'Idea', decision: 'Decision',
    question: 'Question', observation: 'Obs.', journal: 'Journal', reference: 'Ref.',
  };

  return (
    <View style={styles.citedList}>
      {refs.map((ref) => (
        <View key={ref.id} style={styles.citedRow}>
          <View style={styles.citedBadges}>
            <View style={[styles.badge, { backgroundColor: DOMAIN_COLORS[ref.domain] ?? '#5F6B66' }]}>
              <Text style={styles.badgeText}>{ref.domain}</Text>
            </View>
            <View style={styles.typeBadge}>
              <Text style={styles.typeBadgeText}>{TYPE_LABELS[ref.objectType] ?? ref.objectType}</Text>
            </View>
          </View>
          <Text style={styles.citedTitle} numberOfLines={2}>{ref.title}</Text>
        </View>
      ))}
    </View>
  );
}

function BulletList({ items, color }: { items: string[]; color: string }) {
  const styles = useThemedStyles(createStyles);
  return (
    <View style={styles.bulletList}>
      {items.map((item, i) => (
        <View key={i} style={styles.bulletRow}>
          <View style={[styles.bullet, { backgroundColor: color }]} />
          <Text style={styles.bulletText}>{item}</Text>
        </View>
      ))}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: c.bg },
    scroll: { flex: 1 },
    scrollContent: { padding: 16, paddingBottom: 40 },
    skeletonGap: { marginTop: Spacing.md },

    header: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingVertical: 14,
      backgroundColor: c.bg,
      borderBottomWidth: 1,
      borderBottomColor: c.border,
    },
    headerTitle: { fontSize: 17, fontFamily: Fonts.bold, color: c.text },

    // Empty state
    emptyState: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      padding: 32,
    },
    emptyIcon: { marginBottom: 16 },
    emptyTitle: { fontSize: 20, fontFamily: Fonts.bold, color: c.text, marginBottom: 8 },
    emptySubtitle: {
      fontSize: 14,
      color: c.textMuted,
      textAlign: 'center',
      lineHeight: 22,
      marginBottom: 32,
    },
    generateButton: {
      backgroundColor: c.accent,
      paddingHorizontal: 24,
      paddingVertical: 14,
      borderRadius: 12,
      minWidth: 220,
      alignItems: 'center',
    },
    generateButtonText: { color: '#FFFFFF', fontSize: 15, fontFamily: Fonts.semibold },

    // Hero summary card
    heroCard: {
      backgroundColor: c.accentLight,
      borderWidth: 1,
      borderColor: c.accentBorder,
      borderRadius: Radius.lg,
      padding: Spacing.lg,
      marginBottom: Spacing.md,
    },
    heroRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.md,
    },
    heroChip: {
      width: 40,
      height: 40,
      borderRadius: 12,
      backgroundColor: c.accent,
      justifyContent: 'center',
      alignItems: 'center',
    },
    heroTextBlock: { flex: 1 },
    heroLabel: {
      ...Type.label,
      color: c.accent,
      marginBottom: 3,
    },
    heroTitle: {
      ...Type.heading,
      color: c.text,
    },
    heroMeta: {
      fontSize: 12,
      fontFamily: Fonts.regular,
      color: c.textMuted,
      marginTop: Spacing.md,
    },
    regenButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      backgroundColor: c.bgSurface,
      borderWidth: 1,
      borderColor: c.accentBorder,
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: Radius.full,
    },
    regenButtonDisabled: { opacity: 0.5 },
    regenButtonText: { color: c.accent, fontSize: 13, fontFamily: Fonts.semibold },

    // Domain chips
    domainsRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 6,
      marginBottom: 16,
    },
    domainChip: {
      backgroundColor: c.bgMuted,
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 12,
    },
    domainChipText: { color: c.textMuted, fontSize: 12 },

    // Sections
    section: {
      backgroundColor: c.bgSurface,
      borderRadius: Radius.lg,
      padding: Spacing.lg,
      marginBottom: Spacing.md,
      ...Elevation.level1,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: c.border,
    },
    sectionTitleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.sm + 2,
      marginBottom: Spacing.md,
    },
    sectionIconChip: {
      width: 30,
      height: 30,
      borderRadius: 9,
      justifyContent: 'center',
      alignItems: 'center',
    },
    sectionTitle: {
      ...Type.heading,
      color: c.text,
    },
    narrative: {
      fontSize: 14,
      color: c.textSecondary,
      lineHeight: 22,
    },
    narrativeParagraph: {
      marginTop: 12,
    },

    collapsibleHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 0,
    },

    // Cited notes
    citedList: { gap: 10, marginTop: 12 },
    citedRow: { gap: 4 },
    citedBadges: { flexDirection: 'row', gap: 6 },
    badge: {
      paddingHorizontal: 8,
      paddingVertical: 2,
      borderRadius: 4,
    },
    badgeText: { fontSize: 11, fontFamily: Fonts.semibold, color: '#FFFFFF' },
    typeBadge: {
      paddingHorizontal: 8,
      paddingVertical: 2,
      borderRadius: 4,
      backgroundColor: c.bgMuted,
      borderWidth: 1,
      borderColor: c.border,
    },
    typeBadgeText: { fontSize: 11, color: c.textMuted },
    citedTitle: { fontSize: 13, color: c.textSecondary, lineHeight: 18 },

    // Bullets
    bulletList: { gap: Spacing.sm },
    bulletRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
    bullet: { width: 5, height: 5, borderRadius: 2.5, marginTop: 7.5 },
    bulletText: { flex: 1, fontSize: 14, color: c.textSecondary, lineHeight: 20 },

    // Dormant ideas
    dormantCard: {
      backgroundColor: c.bgMuted,
      borderRadius: 8,
      padding: 12,
      marginBottom: 8,
    },
    dormantCardHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginBottom: 4,
    },
    dormantAge: { fontSize: 11, color: c.textFaint, fontFamily: Fonts.semibold },
    dormantArchive: { fontSize: 11, color: c.accent, fontFamily: Fonts.semibold },
    dormantText: { fontSize: 13, color: c.textSecondary, lineHeight: 18 },
    dormantMention: { fontSize: 11, color: c.accent, marginTop: 4 },

    // Decision reviews
    decisionCard: {
      backgroundColor: c.bgMuted,
      borderRadius: 8,
      padding: 12,
      marginBottom: 8,
    },
    decisionText: { fontSize: 13, color: c.textSecondary, marginBottom: 8, lineHeight: 18 },
    decisionInput: {
      backgroundColor: c.bgSurface,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 8,
      paddingHorizontal: 12,
      paddingVertical: 8,
      fontSize: 13,
      color: c.text,
      marginBottom: 8,
    },
    decisionSubmit: {
      backgroundColor: c.accent,
      borderRadius: 8,
      paddingVertical: 8,
      alignItems: 'center',
    },
    decisionSubmitDisabled: { opacity: 0.4 },
    decisionSubmitText: { color: '#FFFFFF', fontSize: 13, fontFamily: Fonts.semibold },

    // History
    historyItem: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: 10,
      borderBottomWidth: 1,
      borderBottomColor: c.border,
    },
    historyDate: { fontSize: 14, color: c.textSecondary },
    historyCount: { fontSize: 12, color: c.textFaint },
  });
