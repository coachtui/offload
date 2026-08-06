import React, { useState } from 'react';
import {
  View,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAuth } from '../context/AuthContext';
import { RootStackParamList } from '../navigation/types';
import { AppText, AppInput, AppButton, AppPressable, Spacing, Radius } from '../components/ui';
import { Fonts, ThemeColors, useTheme, useThemedStyles } from '../theme';

type LoginScreenNavigationProp = NativeStackNavigationProp<RootStackParamList, 'Login'>;

interface Props {
  navigation: LoginScreenNavigationProp;
}

export function LoginScreen({ navigation }: Props) {
  const { login } = useAuth();
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [fieldError, setFieldError] = useState<{ email?: string; password?: string }>({});
  const [formError, setFormError] = useState<string | null>(null);

  async function handleLogin() {
    const errors: { email?: string; password?: string } = {};
    if (!email.trim()) errors.email = 'Enter your email address';
    if (!password.trim()) errors.password = 'Enter your password';
    setFieldError(errors);
    setFormError(null);
    if (Object.keys(errors).length > 0) return;

    setIsLoading(true);
    try {
      await login({ email: email.trim(), password });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Couldn't sign in. Check your details and try again.";
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
      <View style={styles.content}>
        {/* Brand mark */}
        <View style={styles.brandBlock}>
          <View style={styles.brandMark}>
            <Ionicons name="mic" size={26} color="#FFFFFF" />
          </View>
          <AppText variant="display" align="center">
            Offload
          </AppText>
          <AppText variant="body" color="muted" align="center" style={styles.tagline}>
            Say it once. It's handled.
          </AppText>
        </View>

        <View style={styles.form}>
          <AppInput
            label="Email"
            placeholder="you@example.com"
            value={email}
            onChangeText={(t) => {
              setEmail(t);
              if (fieldError.email) setFieldError((e) => ({ ...e, email: undefined }));
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
            placeholder="Your password"
            value={password}
            onChangeText={(t) => {
              setPassword(t);
              if (fieldError.password) setFieldError((e) => ({ ...e, password: undefined }));
            }}
            error={fieldError.password}
            secureTextEntry
            autoComplete="password"
            textContentType="password"
            editable={!isLoading}
          />

          {formError ? (
            <View style={styles.formError} accessibilityRole="alert">
              <Ionicons name="alert-circle" size={16} color={colors.error} />
              <AppText variant="secondary" color="error" style={styles.formErrorText}>
                {formError}
              </AppText>
            </View>
          ) : null}

          <AppButton
            label={isLoading ? 'Signing in…' : 'Sign in'}
            onPress={handleLogin}
            disabled={isLoading}
            size="lg"
            style={styles.submit}
          />

          <AppPressable
            scale={false}
            style={styles.linkButton}
            onPress={() => navigation.navigate('Register')}
            disabled={isLoading}
            accessibilityRole="button"
            accessibilityLabel="Create an account"
          >
            <AppText variant="secondary" color="muted">
              No account?{' '}
              <AppText variant="secondary" style={styles.linkBold}>
                Sign up
              </AppText>
            </AppText>
          </AppPressable>
        </View>
      </View>
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
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: Spacing.xxxl,
  },
  brandBlock: {
    alignItems: 'center',
    marginBottom: Spacing.xxxl + 8,
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
