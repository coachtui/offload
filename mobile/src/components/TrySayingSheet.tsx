/**
 * "Try saying…" — the Record screen's one help affordance. A handful of example
 * utterances, one per kind of thing Offload handles, and a route to the full
 * "How Offload works" guide. Deliberately not documentation: the record screen
 * is a focus surface, so this stays one glance long.
 */

import React from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { AppSheet, AppText, AppButton, Spacing, Radius } from './ui';
import { ThemeColors, useThemedStyles } from '../theme';

interface Props {
  visible: boolean;
  onClose: () => void;
  /** Close the sheet and open the full How Offload works guide. */
  onOpenGuide: () => void;
}

const EXAMPLES: Array<{ label: string; text: string }> = [
  {
    label: 'Mix everything together',
    text: '“Pick up chicken from Costco, call Alex tomorrow, and I want to rethink the project schedule.”',
  },
  {
    label: 'Somewhere',
    text: "“Remind me about the batteries when I'm at Home Depot.”",
  },
  {
    label: 'Sometime',
    text: '“Call the accountant Tuesday at 3.”',
  },
  {
    label: 'Remember this',
    text: "“I decided we're not changing vendors this month.”",
  },
  {
    label: 'Think about this later',
    text: "“I've noticed I keep losing energy halfway through my workouts.”",
  },
];

export function TrySayingSheet({ visible, onClose, onOpenGuide }: Props) {
  const styles = useThemedStyles(createStyles);

  return (
    <AppSheet visible={visible} onClose={onClose} title="Try saying…">
      <ScrollView bounces={false} showsVerticalScrollIndicator={false}>
        {EXAMPLES.map((ex) => (
          <View key={ex.label} style={styles.example}>
            <AppText variant="label" color="muted">
              {ex.label}
            </AppText>
            <AppText variant="body" color="secondary" style={styles.exampleText}>
              {ex.text}
            </AppText>
          </View>
        ))}

        <View style={styles.footer}>
          <AppText variant="secondary" color="muted" align="center" style={styles.footerLine}>
            Just talk. Offload handles the structure.
          </AppText>
          <AppButton
            label="How Offload works"
            variant="ghost"
            icon="book-outline"
            onPress={onOpenGuide}
          />
        </View>
      </ScrollView>
    </AppSheet>
  );
}

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
    example: {
      backgroundColor: c.bgMuted,
      borderRadius: Radius.md,
      paddingHorizontal: Spacing.lg,
      paddingVertical: Spacing.md,
      marginTop: Spacing.sm,
    },
    exampleText: {
      fontStyle: 'italic',
      lineHeight: 21,
      marginTop: 3,
    },
    footer: { marginTop: Spacing.lg },
    footerLine: { marginBottom: Spacing.sm },
  });
