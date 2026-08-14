/**
 * First-recording explanation — shown once, after a new user's first recording
 * has been sorted by the server, with the ACTUAL notes it produced. This is the
 * strongest teaching moment in the app: the lesson ("you rambled, Offload
 * sorted it") is demonstrated with the user's own words, not a mock-up.
 *
 * Every chip here reflects real parse output: the type the sorter assigned, a
 * place entity it extracted, a date it heard. Nothing is claimed that wasn't
 * inferred — a note with no place shows no place, and the footer says places
 * "can become" arrival reminders rather than promising a geofence that may
 * still be resolving (or unresolvable).
 */

import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AtomicObject } from '../types';
import { AppSheet, AppText, AppButton, AppPressable, Spacing, Radius } from './ui';
import { ThemeColors, useTheme, useThemedStyles } from '../theme';

interface Props {
  visible: boolean;
  objects: AtomicObject[];
  onClose: () => void;
  /** Close the sheet and open the notes list. */
  onViewNotes: () => void;
}

const MAX_ROWS = 4;

const TYPE_ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  task: 'checkbox-outline',
  reminder: 'alarm-outline',
  commitment: 'hand-right-outline',
  idea: 'bulb-outline',
  question: 'help-circle-outline',
  concern: 'alert-circle-outline',
  decision: 'git-branch-outline',
  journal: 'book-outline',
  observation: 'eye-outline',
  preference: 'heart-outline',
  reference: 'bookmark-outline',
};

function placeEntity(obj: AtomicObject): string | null {
  const entities = obj.metadata?.entities;
  if (!Array.isArray(entities)) return null;
  return entities.find((e) => e.type === 'place')?.value ?? null;
}

function dateHint(obj: AtomicObject): string | null {
  return obj.temporalHints?.hasDate ? obj.temporalHints.dateText : null;
}

export function FirstRecordingSheet({ visible, objects, onClose, onViewNotes }: Props) {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);

  const shown = objects.slice(0, MAX_ROWS);
  const extra = objects.length - shown.length;
  const n = objects.length;

  return (
    <AppSheet visible={visible} onClose={onClose}>
      <View style={styles.body}>
        <AppText variant="title">You said it once. Offload handled the rest.</AppText>
        <AppText variant="body" color="muted" style={styles.subtitle}>
          {n > 1 ? `One recording. ${n} separate memories.` : 'Saved as a memory.'}
        </AppText>

        <View style={styles.list}>
          {shown.map((obj, i) => {
            const place = placeEntity(obj);
            const date = dateHint(obj);
            const type = obj.objectType ?? 'note';
            return (
              <View key={obj.id} style={[styles.row, i > 0 && styles.rowBorder]}>
                <View style={styles.rowIcon}>
                  <Ionicons
                    name={TYPE_ICONS[type] ?? 'document-text-outline'}
                    size={16}
                    color={colors.accent}
                  />
                </View>
                <View style={styles.rowBody}>
                  <AppText variant="secondary" style={styles.rowTitle} numberOfLines={2}>
                    {obj.title ?? obj.content}
                  </AppText>
                  <View style={styles.chipRow}>
                    <AppText variant="label" color="muted">
                      {type}
                    </AppText>
                    {place ? (
                      <View style={styles.hintChip}>
                        <Ionicons name="location-outline" size={11} color={colors.accent} />
                        <AppText variant="secondary" color="accent" style={styles.hintText}>
                          {place}
                        </AppText>
                      </View>
                    ) : null}
                    {date ? (
                      <View style={styles.hintChip}>
                        <Ionicons name="alarm-outline" size={11} color={colors.accent} />
                        <AppText variant="secondary" color="accent" style={styles.hintText}>
                          {date}
                        </AppText>
                      </View>
                    ) : null}
                  </View>
                </View>
              </View>
            );
          })}
          {extra > 0 ? (
            <View style={[styles.row, styles.rowBorder]}>
              <AppText variant="secondary" color="muted">
                +{extra} more
              </AppText>
            </View>
          ) : null}
        </View>

        <AppText variant="secondary" color="muted" style={styles.explainer}>
          Places can become arrival reminders, times become scheduled reminders, and everything is
          searchable through Ask Offload.
        </AppText>

        <AppText variant="secondary" color="faint" style={styles.lesson}>
          You don't have to talk to Offload like an assistant. Change subjects. Ramble. Offload
          sorts it out afterwards.
        </AppText>

        <AppButton label="Got it" onPress={onClose} size="lg" style={styles.cta} />
        <AppPressable
          onPress={onViewNotes}
          style={styles.viewNotes}
          accessibilityRole="button"
          accessibilityLabel="View my notes"
        >
          <AppText variant="secondary" color="accent">
            View my notes
          </AppText>
        </AppPressable>
      </View>
    </AppSheet>
  );
}

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
    body: { paddingTop: Spacing.xs, paddingBottom: Spacing.sm },
    subtitle: { marginTop: Spacing.xs },
    list: {
      backgroundColor: c.bgMuted,
      borderRadius: Radius.md,
      paddingHorizontal: Spacing.lg,
      marginTop: Spacing.lg,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      paddingVertical: Spacing.md,
      gap: Spacing.md,
    },
    rowBorder: {
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: c.borderStrong,
    },
    rowIcon: {
      width: 28,
      height: 28,
      borderRadius: Radius.sm,
      backgroundColor: c.bgSurface,
      alignItems: 'center',
      justifyContent: 'center',
    },
    rowBody: { flex: 1 },
    rowTitle: { color: c.text },
    chipRow: {
      flexDirection: 'row',
      alignItems: 'center',
      flexWrap: 'wrap',
      gap: Spacing.sm,
      marginTop: 4,
    },
    hintChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 3,
    },
    hintText: { fontSize: 12 },
    explainer: { marginTop: Spacing.lg },
    lesson: { marginTop: Spacing.md },
    cta: { width: '100%', marginTop: Spacing.xl },
    viewNotes: { alignItems: 'center', paddingVertical: Spacing.md },
  });
