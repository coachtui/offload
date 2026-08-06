import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { darkColors, Fonts, Radius, Spacing } from '../theme';

interface AudioPlayerProps {
  audioUrl: string;
}

// Media surface deliberately stays dark (sea-glass) in both themes.
const D = darkColors;

function formatTime(seconds: number): string {
  if (!seconds || !isFinite(seconds)) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export function AudioPlayer({ audioUrl }: AudioPlayerProps) {
  const player = useAudioPlayer(audioUrl);
  const status = useAudioPlayerStatus(player);
  const [error, setError] = useState<string | null>(null);

  const isPlaying = status.playing;
  const isLoading = status.isLoaded === false;
  const duration = status.duration || 0;
  const position = status.currentTime || 0;

  useEffect(() => {
    return () => {
      try {
        player?.remove();
      } catch (e) {
        // Ignore cleanup errors - player may not be initialized
      }
    };
  }, [player]);

  const handlePlayPause = useCallback(async () => {
    try {
      setError(null);
      if (isPlaying) {
        player.pause();
      } else {
        player.play();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Playback failed');
    }
  }, [player, isPlaying]);

  const handleSeekBackward = useCallback(() => {
    const newPosition = Math.max(0, position - 10);
    player.seekTo(newPosition);
  }, [player, position]);

  const handleSeekForward = useCallback(() => {
    const newPosition = Math.min(duration, position + 10);
    player.seekTo(newPosition);
  }, [player, position, duration]);

  if (error) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>{error}</Text>
        <TouchableOpacity style={styles.retryButton} onPress={() => setError(null)}>
          <Text style={styles.retryButtonText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.progressContainer}>
        <View style={styles.progressBar}>
          <View
            style={[
              styles.progressFill,
              { width: duration > 0 ? `${(position / duration) * 100}%` : '0%' },
            ]}
          />
        </View>
        <View style={styles.timeContainer}>
          <Text style={styles.timeText}>{formatTime(position)}</Text>
          <Text style={styles.timeText}>{formatTime(duration)}</Text>
        </View>
      </View>

      <View style={styles.controls}>
        <TouchableOpacity
          style={styles.seekButton}
          onPress={handleSeekBackward}
          accessibilityLabel="Back 10 seconds"
        >
          <Text style={styles.seekButtonText}>-10s</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.playButton}
          onPress={handlePlayPause}
          disabled={isLoading}
          accessibilityLabel={isPlaying ? 'Pause' : 'Play'}
        >
          {isLoading ? (
            <ActivityIndicator color="#FFFFFF" size="small" />
          ) : (
            <Ionicons name={isPlaying ? 'pause' : 'play'} size={24} color="#FFFFFF" />
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.seekButton}
          onPress={handleSeekForward}
          accessibilityLabel="Forward 10 seconds"
        >
          <Text style={styles.seekButtonText}>+10s</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: D.bg,
    borderRadius: Radius.md,
    padding: Spacing.lg,
  },
  progressContainer: {
    marginBottom: Spacing.lg,
  },
  progressBar: {
    height: 4,
    backgroundColor: D.bgMuted,
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: D.accent,
  },
  timeContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: Spacing.sm,
  },
  timeText: {
    fontSize: 12,
    fontFamily: Fonts.regular,
    fontVariant: ['tabular-nums'],
    color: D.textMuted,
  },
  controls: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: Spacing.xxl,
  },
  seekButton: {
    padding: Spacing.sm,
  },
  seekButtonText: {
    color: D.textMuted,
    fontSize: 14,
    fontFamily: Fonts.medium,
  },
  playButton: {
    width: 56,
    height: 56,
    borderRadius: Radius.full,
    backgroundColor: D.accent,
    justifyContent: 'center',
    alignItems: 'center',
  },
  playButtonText: {
    fontSize: 24,
    color: '#FFFFFF',
  },
  errorContainer: {
    backgroundColor: D.bg,
    borderRadius: Radius.md,
    padding: Spacing.lg,
    alignItems: 'center',
  },
  errorText: {
    color: D.error,
    fontSize: 14,
    fontFamily: Fonts.regular,
    marginBottom: Spacing.md,
    textAlign: 'center',
  },
  retryButton: {
    backgroundColor: D.bgMuted,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.sm,
  },
  retryButtonText: {
    color: D.text,
    fontSize: 14,
    fontFamily: Fonts.medium,
  },
});
