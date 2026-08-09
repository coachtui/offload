/**
 * Account deletion — App Store Guideline 5.1.1(v).
 *
 * A full screen rather than a sheet, for two reasons. The action is
 * irreversible and deserves a deliberate stop rather than something the user
 * can fat-finger from a list; and `AppSheet` is capped at 85% height with no
 * scroll view, so a password field plus the keyboard plus enough copy to make
 * the consequences clear would push the confirm button off screen on shorter
 * devices — the same trap the Always-location consent sheet hit.
 */
import React, { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { useAuth } from '../context/AuthContext';
import { ApiError } from '../services/api';
import {
  AppScreen,
  AppHeader,
  AppButton,
  AppIconButton,
  AppInput,
  AppText,
  ConfirmSheet,
  Spacing,
  Radius,
} from '../components/ui';
import { ThemeColors, useTheme, useThemedStyles } from '../theme';

type Nav = NativeStackNavigationProp<RootStackParamList, 'DeleteAccount'>;

const CONSEQUENCES = [
  'Every note you have offloaded, and their transcripts',
  'Your saved places and arrival reminders',
  'Your categories, insights, and recorded audio',
];

export default function DeleteAccountScreen({ navigation }: { navigation: Nav }) {
  const { user, deleteAccount } = useAuth();
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);

  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [confirmVisible, setConfirmVisible] = useState(false);

  async function performDelete() {
    setSubmitting(true);
    setError(null);
    try {
      await deleteAccount(password);
      // No navigation on success: the account is gone, so AuthContext has
      // already flipped to unauthenticated and the navigator swaps to the
      // login stack underneath us.
    } catch (e) {
      if (e instanceof ApiError && e.code === 'INVALID_PASSWORD') {
        setError('That password is incorrect.');
      } else {
        setError(
          e instanceof Error && e.message
            ? e.message
            : "Couldn't delete your account. Please try again."
        );
      }
      setSubmitting(false);
    }
  }

  return (
    <AppScreen>
      <AppHeader
        title="Delete account"
        left={
          <AppIconButton
            icon="chevron-back"
            onPress={() => navigation.goBack()}
            accessibilityLabel="Back"
          />
        }
      />

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.warning}>
            <Ionicons name="warning-outline" size={20} color={colors.error} />
            <AppText variant="body" style={styles.warningText}>
              This cannot be undone.
            </AppText>
          </View>

          <AppText variant="body" color="muted" style={styles.lead}>
            Deleting {user?.email ? user.email : 'your account'} permanently erases:
          </AppText>

          {CONSEQUENCES.map((line) => (
            <View key={line} style={styles.bulletRow}>
              <View style={styles.bullet} />
              <AppText variant="body" color="muted" style={styles.bulletText}>
                {line}
              </AppText>
            </View>
          ))}

          <AppText variant="secondary" color="faint" style={styles.note}>
            Offload will also stop watching every place on this phone. If you only
            want to step away, log out instead — your notes stay where they are.
          </AppText>

          <AppInput
            label="Confirm your password"
            value={password}
            onChangeText={(t) => {
              setPassword(t);
              if (error) setError(null);
            }}
            secureTextEntry
            autoCapitalize="none"
            autoComplete="current-password"
            textContentType="password"
            error={error ?? undefined}
            containerStyle={styles.input}
            editable={!submitting}
          />

          <AppButton
            label={submitting ? 'Deleting…' : 'Delete my account'}
            onPress={() => setConfirmVisible(true)}
            disabled={submitting || password.length === 0}
            style={styles.deleteButton}
          />
          <AppButton
            label="Cancel"
            variant="secondary"
            onPress={() => navigation.goBack()}
            disabled={submitting}
            style={styles.cancelButton}
          />
        </ScrollView>
      </KeyboardAvoidingView>

      <ConfirmSheet
        visible={confirmVisible}
        onClose={() => setConfirmVisible(false)}
        onConfirm={performDelete}
        title="Delete your account?"
        message="Everything listed on the previous screen is erased immediately. There is no way to get it back."
        confirmLabel="Delete forever"
        cancelLabel="Keep my account"
        destructive
      />
    </AppScreen>
  );
}

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
    flex: { flex: 1 },
    content: {
      paddingHorizontal: Spacing.xxl,
      paddingTop: Spacing.xl,
      paddingBottom: Spacing.xxl,
    },
    warning: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.sm,
      backgroundColor: c.errorBg,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: c.errorBorder,
      borderRadius: Radius.lg,
      padding: Spacing.md,
      marginBottom: Spacing.xl,
    },
    warningText: { color: c.error, flex: 1 },
    lead: { marginBottom: Spacing.md },
    bulletRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      marginBottom: Spacing.sm,
    },
    bullet: {
      width: 4,
      height: 4,
      borderRadius: Radius.full,
      backgroundColor: c.textFaint,
      marginTop: 9,
      marginRight: Spacing.md,
    },
    bulletText: { flex: 1 },
    note: { marginTop: Spacing.lg, lineHeight: 19 },
    input: { marginTop: Spacing.xxl },
    deleteButton: { marginTop: Spacing.lg, backgroundColor: c.error },
    cancelButton: { marginTop: Spacing.md },
  });
