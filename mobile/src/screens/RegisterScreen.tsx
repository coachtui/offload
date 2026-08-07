import React, { useState } from 'react';
import {
  View,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Linking,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAuth } from '../context/AuthContext';
import { RootStackParamList } from '../navigation/types';
import { AppText, AppInput, AppButton, AppPressable, Spacing, Radius } from '../components/ui';
import { Fonts, ThemeColors, useTheme, useThemedStyles } from '../theme';

type RegisterScreenNavigationProp = NativeStackNavigationProp<RootStackParamList, 'Register'>;

interface Props {
  navigation: RegisterScreenNavigationProp;
}

type FieldErrors = { email?: string; password?: string; confirmPassword?: string };

export function RegisterScreen({ navigation }: Props) {
  const { register } = useAuth();
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [fieldError, setFieldError] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [acceptedTerms, setAcceptedTerms] = useState(false);

  const clearField = (key: keyof FieldErrors) =>
    setFieldError((e) => (e[key] ? { ...e, [key]: undefined } : e));

  async function handleRegister() {
    const errors: FieldErrors = {};
    if (!email.trim()) errors.email = 'Enter your email address';
    if (!password.trim()) errors.password = 'Choose a password';
    else if (password.length < 8) errors.password = 'Must be at least 8 characters';
    if (password && confirmPassword !== password) errors.confirmPassword = "Passwords don't match";
    setFieldError(errors);
    setFormError(null);
    if (Object.keys(errors).length > 0) return;
    if (!acceptedTerms) {
      setFormError('Please accept the Terms of Service and Privacy Policy to continue');
      return;
    }

    setIsLoading(true);
    try {
      await register({
        email: email.trim(),
        password,
        name: name.trim() || undefined,
        acceptedTerms: true,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Couldn't create your account. Try again.";
      setFormError(message);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.brandBlock}>
          <View style={styles.brandMark}>
            <Ionicons name="mic" size={26} color="#FFFFFF" />
          </View>
          <AppText variant="display" align="center">
            Create your account
          </AppText>
          <AppText variant="body" color="muted" align="center" style={styles.tagline}>
            Get it out of your head — Offload keeps it
          </AppText>
        </View>

        <View style={styles.form}>
          <AppInput
            label="Name"
            helper="Optional — used for your greeting"
            placeholder="Your name"
            value={name}
            onChangeText={setName}
            autoCapitalize="words"
            autoComplete="name"
            textContentType="name"
            editable={!isLoading}
          />

          <AppInput
            label="Email"
            placeholder="you@example.com"
            value={email}
            onChangeText={(t) => {
              setEmail(t);
              clearField('email');
            }}
            error={fieldError.email}
            autoCapitalize="none"
            keyboardType="email-address"
            autoComplete="email"
            textContentType="emailAddress"
            editable={!isLoading}
          />

          <AppInput
            label="Password"
            placeholder="At least 8 characters"
            value={password}
            onChangeText={(t) => {
              setPassword(t);
              clearField('password');
            }}
            error={fieldError.password}
            secureTextEntry
            autoComplete="new-password"
            textContentType="newPassword"
            editable={!isLoading}
          />

          <AppInput
            label="Confirm password"
            placeholder="Same again"
            value={confirmPassword}
            onChangeText={(t) => {
              setConfirmPassword(t);
              clearField('confirmPassword');
            }}
            error={fieldError.confirmPassword}
            secureTextEntry
            autoComplete="new-password"
            textContentType="newPassword"
            editable={!isLoading}
          />

          <AppPressable
            style={styles.termsRow}
            onPress={() => setAcceptedTerms((v) => !v)}
            disabled={isLoading}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: acceptedTerms }}
            accessibilityLabel="Accept Terms of Service and Privacy Policy"
          >
            <View style={[styles.checkbox, acceptedTerms && styles.checkboxChecked]}>
              {acceptedTerms ? (
                <Ionicons name="checkmark" size={14} color={colors.onPrimary} />
              ) : null}
            </View>
            <AppText variant="secondary" color="muted" style={styles.termsText}>
              I agree to the{' '}
              <AppText
                variant="secondary"
                style={styles.termsLink}
                onPress={() => Linking.openURL('https://useoffload.app/terms')}
              >
                Terms of Service
              </AppText>{' '}
              and{' '}
              <AppText
                variant="secondary"
                style={styles.termsLink}
                onPress={() => Linking.openURL('https://useoffload.app/privacy')}
              >
                Privacy Policy
              </AppText>
            </AppText>
          </AppPressable>

          {formError ? (
            <View style={styles.formError} accessibilityRole="alert">
              <Ionicons name="alert-circle" size={16} color={colors.error} />
              <AppText variant="secondary" color="error" style={styles.formErrorText}>
                {formError}
              </AppText>
            </View>
          ) : null}

          <AppButton
            label={isLoading ? 'Creating account…' : 'Create account'}
            onPress={handleRegister}
            disabled={isLoading}
            size="lg"
            style={styles.submit}
          />

          <AppPressable
            scale={false}
            style={styles.linkButton}
            onPress={() => navigation.goBack()}
            disabled={isLoading}
            accessibilityRole="button"
            accessibilityLabel="Back to sign in"
          >
            <AppText variant="secondary" color="muted">
              Already have an account?{' '}
              <AppText variant="secondary" style={styles.linkBold}>
                Sign in
              </AppText>
            </AppText>
          </AppPressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: c.bg,
  },
  content: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: Spacing.xxxl,
    paddingVertical: Spacing.xxxl,
  },
  brandBlock: {
    alignItems: 'center',
    marginBottom: Spacing.xxxl,
  },
  brandMark: {
    width: 56,
    height: 56,
    borderRadius: Radius.lg - 2,
    backgroundColor: c.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.lg,
  },
  tagline: {
    marginTop: Spacing.xs,
  },
  form: {
    gap: Spacing.lg,
  },
  termsRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
  },
  checkbox: {
    width: 19,
    height: 19,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: c.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  checkboxChecked: {
    backgroundColor: c.accent,
    borderColor: c.accent,
  },
  termsText: {
    flex: 1,
  },
  termsLink: {
    color: c.text,
    fontFamily: Fonts.semibold,
    textDecorationLine: 'underline',
  },
  formError: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: c.errorBg,
    borderWidth: 1,
    borderColor: c.errorBorder,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm + 2,
  },
  formErrorText: {
    flex: 1,
  },
  submit: {
    marginTop: Spacing.xs,
  },
  linkButton: {
    padding: Spacing.lg,
    alignItems: 'center',
  },
  linkBold: {
    color: c.text,
    fontFamily: Fonts.semibold,
  },
  });
