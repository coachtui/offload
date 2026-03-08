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
  Alert,
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { apiService, WeeklySynthesis, SynthesisRef } from '../services/api';

interface SynthesisScreenProps {
  navigation: any;
}

export default function SynthesisScreen({ navigation }: SynthesisScreenProps) {
  const [synthesis, setSynthesis] = useState<WeeklySynthesis | null>(null);
  const [history, setHistory] = useState<WeeklySynthesis[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Dormant ideas
  const [dormantIdeas, setDormantIdeas] = useState<import('../services/api').DormantIdea[]>([]);
  const [dormantLoading, setDormantLoading] = useState(false);
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());

  // Decision reviews
  const [pendingDecisions, setPendingDecisions] = useState<import('../types').AtomicObject[]>([]);
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
        Alert.alert('Error', msg);
      } finally {
        setGenerating(false);
      }
    },
    []
  );

  const handleArchiveIdea = useCallback(async (id: string) => {
    try {
      await apiService.updateObjectState(id, 'archived');
      setDismissedIds((prev) => new Set([...prev, id]));
    } catch { /* silent */ }
  }, []);

  const handleReviewDecision = useCallback(async (id: string) => {
    const outcome = decisionReviewText[id];
    if (!outcome?.trim()) return;
    try {
      await apiService.reviewDecision(id, outcome.trim());
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
          <Text style={styles.emptyIcon}>🧠</Text>
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
              <ActivityIndicator color="#fff" />
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
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#6366f1" />
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
            tintColor="#6366f1"
          />
        }
      >
        {/* Period + generate button */}
        <View style={styles.periodRow}>
          <View>
            <Text style={styles.periodLabel}>Week of</Text>
            <Text style={styles.periodText}>{synthesis ? formatPeriod(synthesis) : ''}</Text>
            <Text style={styles.objectCount}>
              {synthesis?.objectCount ?? 0} notes analysed
            </Text>
          </View>
          <TouchableOpacity
            style={[styles.regenButton, generating && styles.regenButtonDisabled]}
            onPress={() => handleGenerate(true)}
            disabled={generating}
          >
            {generating ? (
              <ActivityIndicator color="#6366f1" size="small" />
            ) : (
              <>
                <Ionicons name="refresh" size={14} color="#6366f1" />
                <Text style={styles.regenButtonText}>Refresh</Text>
              </>
            )}
          </TouchableOpacity>
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
            <Section title="This Week" icon="📖">
              {synthesis.narrative
                .split(/\n\n+/)
                .map((para, i) => (
                  <Text key={i} style={[styles.narrative, i > 0 && styles.narrativeParagraph]}>
                    {para.trim()}
                  </Text>
                ))}
            </Section>

            {/* Patterns */}
            {synthesis.patterns.length > 0 && (
              <Section title="Patterns" icon="🔁">
                <BulletList items={synthesis.patterns} color="#6366f1" />
              </Section>
            )}

            {/* Open threads */}
            {synthesis.openThreads.length > 0 && (
              <Section title="Open Threads" icon="🧵">
                <BulletList items={synthesis.openThreads} color="#f59e0b" />
              </Section>
            )}

            {/* Action items */}
            {synthesis.actionableInsights.length > 0 && (
              <Section title="Action Items" icon="✅">
                <BulletList items={synthesis.actionableInsights} color="#10b981" />
              </Section>
            )}

            {/* Contradictions */}
            {synthesis.contradictions.length > 0 && (
              <Section title="Contradictions" icon="⚡">
                <BulletList items={synthesis.contradictions} color="#ef4444" />
              </Section>
            )}

            {/* Cited Notes — collapsible */}
            {synthesis.citedObjects && synthesis.citedObjects.length > 0 && (
              <CollapsibleCitedNotes refs={synthesis.citedObjects} />
            )}

            {/* Revisit — dormant ideas */}
            {(dormantLoading || dormantIdeas.filter(i => !dismissedIds.has(i.id)).length > 0) && (
              <Section title="Revisit" icon="💡">
                {dormantLoading ? (
                  <ActivityIndicator size="small" color="#6366f1" />
                ) : (
                  dormantIdeas
                    .filter((idea) => !dismissedIds.has(idea.id))
                    .map((idea) => (
                      <View key={idea.id} style={styles.dormantCard}>
                        <View style={styles.dormantCardHeader}>
                          <Text style={styles.dormantAge}>{idea.daysDormant}d dormant</Text>
                          <TouchableOpacity onPress={() => handleArchiveIdea(idea.id)}>
                            <Text style={styles.dormantArchive}>Archive</Text>
                          </TouchableOpacity>
                        </View>
                        <Text style={styles.dormantText} numberOfLines={3}>
                          {idea.title || idea.cleanedText}
                        </Text>
                        {idea.mentionCount > 0 && (
                          <Text style={styles.dormantMention}>Referenced {idea.mentionCount}× in past</Text>
                        )}
                      </View>
                    ))
                )}
              </Section>
            )}

            {/* Decision Reviews */}
            {pendingDecisions.filter(d => !submittedDecisions.has(d.id)).length > 0 && (
              <Section title="Decision Reviews" icon="⚖️">
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
                        placeholderTextColor="#9CA3AF"
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
              <Section title="Previous" icon="📅">
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
  return (
    <View style={styles.header}>
      <TouchableOpacity onPress={() => navigation.goBack()}>
        <Ionicons name="arrow-back" size={24} color="#374151" />
      </TouchableOpacity>
      <Text style={styles.headerTitle}>Insights</Text>
      <View style={{ width: 24 }} />
    </View>
  );
}

function Section({
  title,
  icon,
  children,
}: {
  title: string;
  icon: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>
        {icon} {title}
      </Text>
      {children}
    </View>
  );
}

function CollapsibleCitedNotes({ refs }: { refs: SynthesisRef[] }) {
  const [open, setOpen] = useState(false);
  return (
    <View style={styles.section}>
      <TouchableOpacity style={styles.collapsibleHeader} onPress={() => setOpen((o) => !o)}>
        <Text style={[styles.sectionTitle, { marginBottom: 0 }]}>🔗 Sources ({refs.length})</Text>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={16} color="#9CA3AF" />
      </TouchableOpacity>
      {open && <CitedNotes refs={refs} />}
    </View>
  );
}

function CitedNotes({ refs }: { refs: SynthesisRef[] }) {
  const DOMAIN_COLORS: Record<string, string> = {
    work: '#3b82f6',
    personal: '#8b5cf6',
    health: '#10b981',
    family: '#f59e0b',
    finance: '#ef4444',
    project: '#6366f1',
    misc: '#6b7280',
    unknown: '#4b5563',
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
            <View style={[styles.badge, { backgroundColor: DOMAIN_COLORS[ref.domain] ?? '#4b5563' }]}>
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

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  scroll: { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 40 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  headerTitle: { fontSize: 17, fontWeight: '700', color: '#111827' },

  // Empty state
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  emptyIcon: { fontSize: 56, marginBottom: 16 },
  emptyTitle: { fontSize: 20, fontWeight: '700', color: '#111827', marginBottom: 8 },
  emptySubtitle: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 32,
  },
  generateButton: {
    backgroundColor: '#6366f1',
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 12,
    minWidth: 220,
    alignItems: 'center',
  },
  generateButtonText: { color: '#fff', fontSize: 15, fontWeight: '600' },

  // Period row
  periodRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  periodLabel: { fontSize: 12, color: '#9CA3AF', marginBottom: 2 },
  periodText: { fontSize: 15, fontWeight: '700', color: '#111827' },
  objectCount: { fontSize: 12, color: '#9CA3AF', marginTop: 2 },
  regenButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#EEF2FF',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
  },
  regenButtonDisabled: { opacity: 0.5 },
  regenButtonText: { color: '#6366f1', fontSize: 13, fontWeight: '600' },

  // Domain chips
  domainsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 16,
  },
  domainChip: {
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  domainChipText: { color: '#6B7280', fontSize: 12 },

  // Sections
  section: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#E5E7EB',
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 12,
  },
  narrative: {
    fontSize: 14,
    color: '#374151',
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
  badgeText: { fontSize: 11, fontWeight: '600', color: '#fff' },
  typeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: '#F3F4F6',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  typeBadgeText: { fontSize: 11, color: '#6B7280' },
  citedTitle: { fontSize: 13, color: '#374151', lineHeight: 18 },

  // Bullets
  bulletList: { gap: 8 },
  bulletRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  bullet: { width: 6, height: 6, borderRadius: 3, marginTop: 7 },
  bulletText: { flex: 1, fontSize: 14, color: '#374151', lineHeight: 20 },

  // Dormant ideas
  dormantCard: {
    backgroundColor: '#F3F4F6',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
  },
  dormantCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  dormantAge: { fontSize: 11, color: '#9CA3AF', fontWeight: '600' },
  dormantArchive: { fontSize: 11, color: '#6366f1', fontWeight: '600' },
  dormantText: { fontSize: 13, color: '#374151', lineHeight: 18 },
  dormantMention: { fontSize: 11, color: '#6366f1', marginTop: 4 },

  // Decision reviews
  decisionCard: {
    backgroundColor: '#F3F4F6',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
  },
  decisionText: { fontSize: 13, color: '#374151', marginBottom: 8, lineHeight: 18 },
  decisionInput: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 13,
    color: '#111827',
    marginBottom: 8,
  },
  decisionSubmit: {
    backgroundColor: '#6366f1',
    borderRadius: 8,
    paddingVertical: 8,
    alignItems: 'center',
  },
  decisionSubmitDisabled: { opacity: 0.4 },
  decisionSubmitText: { color: '#fff', fontSize: 13, fontWeight: '600' },

  // History
  historyItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  historyDate: { fontSize: 14, color: '#374151' },
  historyCount: { fontSize: 12, color: '#9CA3AF' },
});
