import React, { useEffect, useRef } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Animated,
  Easing,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useDeepgramTranscription, prefetchDeepgramToken } from '../hooks/useDeepgramTranscription';
import { useGeofences } from '../hooks/useGeofences';
import { RootStackParamList } from '../navigation/types';
import { AppText, AppPressable } from '../components/ui';
import { darkColors, Fonts, Radius, Spacing } from '../theme';
import { haptic } from '../theme/haptics';
import { locationService } from '../services/locationService';
import { emitArrivalPromptCandidate } from '../services/arrivalPromptBus';

type RecordScreenNavigationProp = NativeStackNavigationProp<RootStackParamList, 'Record'>;

interface Props {
  navigation: RecordScreenNavigationProp;
}

// The capture screen deliberately commits to an immersive dark "focus mode"
// regardless of app theme, so it draws from the dark palette directly.
const D = darkColors;
const ORB_TEAL = '#159B87';

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

/** Expanding ring that pulses outward from the orb while recording. */
function PulseRing({ delay }: { delay: number }) {
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animation = Animated.sequence([
      Animated.delay(delay),
      Animated.loop(
        Animated.timing(anim, {
          toValue: 1,
          duration: 2600,
          easing: Easing.out(Easing.ease),
          useNativeDriver: true,
        })
      ),
    ]);
    animation.start();
    return () => animation.stop();
  }, [anim, delay]);

  const scale = anim.interpolate({ inputRange: [0, 1], outputRange: [0.62, 1.22] });
  const opacity = anim.interpolate({ inputRange: [0, 0.15, 1], outputRange: [0, 0.7, 0] });

  return <Animated.View style={[styles.ring, { opacity, transform: [{ scale }] }]} />;
}

/** Decorative listening bar (no real amplitude data from the stream yet). */
function WaveBar({ height, delay }: { height: number; delay: number }) {
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animation = Animated.sequence([
      Animated.delay(delay),
      Animated.loop(
        Animated.sequence([
          Animated.timing(anim, { toValue: 1, duration: 550, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
          Animated.timing(anim, { toValue: 0, duration: 550, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        ])
      ),
    ]);
    animation.start();
    return () => animation.stop();
  }, [anim, delay]);

  const scaleY = anim.interpolate({ inputRange: [0, 1], outputRange: [0.35, 1] });

  return <Animated.View style={[styles.waveBar, { height, transform: [{ scaleY }] }]} />;
}

/** Blinking element (recording dot, transcript cursor). */
function Blink({ children, style }: { children?: React.ReactNode; style?: any }) {
  const anim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(anim, { toValue: 0.25, duration: 700, useNativeDriver: true }),
        Animated.timing(anim, { toValue: 1, duration: 700, useNativeDriver: true }),
      ])
    );
    animation.start();
    return () => animation.stop();
  }, [anim]);

  return <Animated.View style={[style, { opacity: anim }]}>{children}</Animated.View>;
}

const WAVE_HEIGHTS = [10, 18, 24, 14, 22, 12, 20, 26, 15, 9];

export function RecordScreen({ navigation }: Props) {
  const {
    status,
    partialTranscript,
    finalTranscript,
    duration,
    error,
    savedObjectIds,
    isEnhancing,
    startRecording,
    stopRecording,
    reset,
    setRecordingLocation,
  } = useDeepgramTranscription();

  const { fetchGeofences } = useGeofences();

  useEffect(() => {
    prefetchDeepgramToken();
  }, []);

  const isRecording = status === 'recording';
  const isConnecting = status === 'connecting';
  const isProcessing = status === 'processing';
  const isDone = status === 'done';
  const hasTranscript = !!(finalTranscript || partialTranscript);

  async function handleRecordPress() {
    if (isRecording) {
      haptic.success();
      await stopRecording({
        // Geofence re-sync: schedule here (inside the background save callback) so it
        // fires even after RecordScreen has been popped from the stack on navigation.
        onGeofencesNeeded: (placeNames) => {
          console.log('[RecordScreen] Geofence candidates detected — scheduling re-sync in 6s (persists through navigation)');
          setTimeout(() => {
            console.log('[RecordScreen] Re-fetching geofences to pick up inferred places');
            fetchGeofences();
          }, 6000);
          // Hand the place off to Home, which is what's on screen by now, so it
          // can offer the "Always" location escalation with the place named.
          emitArrivalPromptCandidate(placeNames);
        },
      });
      navigation.navigate('Home');
      return;
    } else if (status === 'idle' || status === 'done' || status === 'error') {
      // Start immediately — don't make the tap wait on location (up to 5s).
      // The location fetch runs in parallel and is handed to the hook when
      // (if) it resolves; no location is already a supported case.
      haptic.action();
      void startRecording();
      locationService
        .getCurrentLocation()
        .then((loc) => {
          if (loc) {
            setRecordingLocation({
              latitude: loc.coords.latitude,
              longitude: loc.coords.longitude,
              accuracy: loc.coords.accuracy ?? undefined,
            });
          }
        })
        .catch(() => {});
    }
  }

  const statusChip = isRecording
    ? 'Listening'
    : isConnecting
    ? 'Starting…'
    : isProcessing
    ? 'Saving…'
    : isDone
    ? savedObjectIds.length > 0
      ? `Saved ${savedObjectIds.length} item${savedObjectIds.length > 1 ? 's' : ''}`
      : 'Done'
    : 'Ready';

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <StatusBar style="light" />

      {/* Top row: status chip + actions */}
      <View style={styles.topRow}>
        <View style={styles.chip}>
          {isRecording ? <Blink style={styles.chipDot} /> : null}
          <AppText variant="secondary" style={styles.chipText}>
            {statusChip}
          </AppText>
        </View>
        <View style={styles.topActions}>
          {hasTranscript && !isRecording ? (
            <AppPressable onPress={reset} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityRole="button" accessibilityLabel="Clear transcript">
              <AppText variant="secondary" style={styles.clearText}>
                Clear
              </AppText>
            </AppPressable>
          ) : null}
          <AppPressable
            onPress={() => navigation.goBack()}
            style={styles.closeBtn}
            accessibilityRole="button"
            accessibilityLabel="Close"
          >
            <Ionicons name="close" size={18} color={D.textMuted} />
          </AppPressable>
        </View>
      </View>

      {/* Stage: orb + timer + wave */}
      <View style={styles.stage}>
        <View style={styles.orbWrap}>
          {isRecording ? (
            <>
              <PulseRing delay={0} />
              <PulseRing delay={870} />
              <PulseRing delay={1740} />
            </>
          ) : null}
          <AppPressable
            onPress={handleRecordPress}
            disabled={isConnecting || isProcessing}
            style={[styles.orb, { backgroundColor: isRecording ? ORB_TEAL : D.record }]}
            accessibilityRole="button"
            accessibilityLabel={isRecording ? 'Stop recording' : 'Start recording'}
          >
            {isConnecting || isProcessing ? (
              <ActivityIndicator size="large" color="#FFFFFF" />
            ) : (
              <Ionicons name="mic" size={34} color="#FFFFFF" />
            )}
          </AppPressable>
        </View>

        {isRecording || duration > 0 ? (
          <AppText style={styles.timer}>{formatDuration(duration)}</AppText>
        ) : null}

        {isRecording ? (
          <View style={styles.wave}>
            {WAVE_HEIGHTS.map((h, i) => (
              <WaveBar key={i} height={h} delay={i * 100} />
            ))}
          </View>
        ) : !hasTranscript && status === 'idle' ? (
          <AppText variant="body" align="center" style={styles.idleHint}>
            Tap the mic and just talk —{'\n'}Offload sorts it out afterwards
          </AppText>
        ) : null}
      </View>

      {/* Transcript */}
      {hasTranscript || isRecording ? (
        <View style={styles.transcriptCard}>
          <ScrollView style={styles.transcriptScroll} showsVerticalScrollIndicator={false}>
            <AppText variant="body" style={styles.transcriptText}>
              {finalTranscript ? <AppText style={styles.finalText}>{finalTranscript} </AppText> : null}
              {partialTranscript ? <AppText style={styles.liveText}>{partialTranscript}</AppText> : null}
              {!finalTranscript && !partialTranscript ? (
                <AppText style={styles.waitingText}>Listening…</AppText>
              ) : null}
            </AppText>
            {isRecording ? <Blink style={styles.cursor} /> : null}
          </ScrollView>
          {isEnhancing ? (
            <View style={styles.inlineStatus}>
              <ActivityIndicator size="small" color={D.accent} />
              <AppText variant="secondary" style={styles.inlineStatusText}>
                Improving transcript…
              </AppText>
            </View>
          ) : null}
        </View>
      ) : null}

      {error ? (
        <View style={styles.errorBanner}>
          <Ionicons name="alert-circle" size={16} color={D.error} />
          <AppText variant="secondary" style={styles.errorText}>
            {error}
          </AppText>
        </View>
      ) : null}

      {/* Bottom action */}
      <View style={styles.bottomRow}>
        {isRecording ? (
          <AppPressable
            onPress={handleRecordPress}
            style={styles.stopPill}
            accessibilityRole="button"
            accessibilityLabel="Stop and save"
          >
            <Ionicons name="stop" size={13} color={D.onPrimary} />
            <AppText variant="secondary" style={styles.stopPillText}>
              Done — offload it
            </AppText>
          </AppPressable>
        ) : (
          <AppText variant="secondary" style={styles.bottomHint}>
            {isConnecting ? 'Starting…' : isProcessing ? 'Saving…' : hasTranscript ? 'Tap the mic to add more' : 'Tap the mic to start'}
          </AppText>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: D.bg,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.md,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: D.accentLight,
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.md,
    paddingVertical: 5,
  },
  chipDot: {
    width: 6,
    height: 6,
    borderRadius: Radius.full,
    backgroundColor: D.record,
  },
  chipText: {
    color: D.success,
    fontFamily: Fonts.semibold,
    fontSize: 12,
  },
  topActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.lg,
  },
  clearText: {
    color: D.textMuted,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: Radius.full,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stage: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xl,
    paddingHorizontal: Spacing.xxl,
  },
  orbWrap: {
    width: 156,
    height: 156,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ring: {
    position: 'absolute',
    width: 156,
    height: 156,
    borderRadius: Radius.full,
    borderWidth: 1.5,
    borderColor: 'rgba(83, 184, 165, 0.55)',
  },
  orb: {
    width: 94,
    height: 94,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: ORB_TEAL,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.45,
    shadowRadius: 26,
    elevation: 8,
  },
  timer: {
    color: D.text,
    fontSize: 27,
    lineHeight: 32,
    fontFamily: Fonts.bold,
    fontVariant: ['tabular-nums'],
  },
  wave: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    height: 26,
  },
  waveBar: {
    width: 3,
    borderRadius: Radius.full,
    backgroundColor: D.accent,
  },
  idleHint: {
    color: D.textMuted,
    lineHeight: 23,
  },
  transcriptCard: {
    marginHorizontal: Spacing.xl,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    borderRadius: Radius.lg,
    padding: Spacing.lg,
    maxHeight: 190,
  },
  transcriptScroll: {
    flexGrow: 0,
  },
  transcriptText: {
    color: D.textSecondary,
    lineHeight: 23,
  },
  finalText: {
    color: D.textSecondary,
  },
  liveText: {
    color: D.text,
    fontFamily: Fonts.medium,
  },
  waitingText: {
    color: D.textFaint,
    fontStyle: 'italic',
  },
  cursor: {
    width: 2,
    height: 14,
    backgroundColor: D.accent,
    marginTop: 4,
  },
  inlineStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginTop: Spacing.md,
  },
  inlineStatusText: {
    color: D.textMuted,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginHorizontal: Spacing.xl,
    marginTop: Spacing.md,
    backgroundColor: D.errorBg,
    borderWidth: 1,
    borderColor: D.errorBorder,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm + 2,
  },
  errorText: {
    color: D.error,
    flex: 1,
  },
  bottomRow: {
    alignItems: 'center',
    paddingVertical: Spacing.xxl,
    minHeight: 92,
    justifyContent: 'center',
  },
  stopPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: D.primary,
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.xxl,
    paddingVertical: Spacing.md,
  },
  stopPillText: {
    color: D.onPrimary,
    fontFamily: Fonts.bold,
  },
  bottomHint: {
    color: D.textFaint,
  },
});
