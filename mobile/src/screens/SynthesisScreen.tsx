/**
 * SynthesisScreen — weekly cross-domain reflection
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

  const loadHistory = useCallback(async () => {
    try {
      const { syntheses } = await apiService.getSyntheses();
      setHistory(syntheses);
      if (syntheses.length > 0) setSynthesis(syntheses[0]);
    } catch (err: any) {
      setError(err.message || 'Failed to load synthesis history');
    }
  }, []);

  useEffect(() => {
    loadHistory().finally(() => setLoading(false));
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
        // Refresh history to include new entry
        const { syntheses } = await apiService.getSyntheses();
        setHistory(syntheses);
      } catch (err: any) {
        const msg = err.message || 'Failed to generate synthesis';
        setError(msg);
        Alert.alert('Error', msg);
      } finally {
        setGenerating(false);
      }
    },
    []
  );

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
          <Text style={styles.emptyTitle}>No synthesis yet</Text>
          <Text style={styles.emptySubtitle}>
            Generate your first weekly reflection to see patterns across your notes.
          </Text>
          <TouchableOpacity
            style={styles.generateButton}
            onPress={() => handleGenerate(false)}
            disabled={generating}
          >
            {generating ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.generateButtonText}>Generate This Week's Synthesis</Text>
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

            {/* Narrative — split into paragraphs */}
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

            {/* Past syntheses */}
            {history.length > 1 && (
              <Section title="Past Weeks" icon="📅">
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
        <Ionicons name="arrow-back" size={24} color="#f9fafb" />
      </TouchableOpacity>
      <Text style={styles.headerTitle}>Weekly Synthesis</Text>
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
        <Text style={[styles.sectionTitle, { marginBottom: 0 }]}>🔗 Cited Notes ({refs.length})</Text>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={16} color="#6b7280" />
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
  container: { flex: 1, backgroundColor: '#0a0a0a' },
  scroll: { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 40 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#1f2937',
  },
  headerTitle: { fontSize: 17, fontWeight: '700', color: '#f9fafb' },

  // Empty state
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  emptyIcon: { fontSize: 56, marginBottom: 16 },
  emptyTitle: { fontSize: 20, fontWeight: '700', color: '#f9fafb', marginBottom: 8 },
  emptySubtitle: {
    fontSize: 14,
    color: '#9ca3af',
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
  periodLabel: { fontSize: 12, color: '#6b7280', marginBottom: 2 },
  periodText: { fontSize: 15, fontWeight: '700', color: '#f9fafb' },
  objectCount: { fontSize: 12, color: '#6b7280', marginTop: 2 },
  regenButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#1e1b4b',
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
    backgroundColor: '#1f2937',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  domainChipText: { color: '#9ca3af', fontSize: 12 },

  // Sections
  section: {
    backgroundColor: '#111827',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#f9fafb',
    marginBottom: 12,
  },
  narrative: {
    fontSize: 14,
    color: '#d1d5db',
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
    backgroundColor: '#1f2937',
    borderWidth: 1,
    borderColor: '#374151',
  },
  typeBadgeText: { fontSize: 11, color: '#9ca3af' },
  citedTitle: { fontSize: 13, color: '#d1d5db', lineHeight: 18 },

  // Bullets
  bulletList: { gap: 8 },
  bulletRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  bullet: { width: 6, height: 6, borderRadius: 3, marginTop: 7 },
  bulletText: { flex: 1, fontSize: 14, color: '#d1d5db', lineHeight: 20 },

  // History
  historyItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#1f2937',
  },
  historyDate: { fontSize: 14, color: '#d1d5db' },
  historyCount: { fontSize: 12, color: '#6b7280' },
});
