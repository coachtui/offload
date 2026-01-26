import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';

interface AudioPlayerProps {
  audioUrl: string;
}

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
        <TouchableOpacity style={styles.seekButton} onPress={handleSeekBackward}>
          <Text style={styles.seekButtonText}>-10s</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.playButton} onPress={handlePlayPause} disabled={isLoading}>
          {isLoading ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text style={styles.playButtonText}>{isPlaying ? '⏸' : '▶'}</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity style={styles.seekButton} onPress={handleSeekForward}>
          <Text style={styles.seekButtonText}>+10s</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 16,
  },
  progressContainer: {
    marginBottom: 16,
  },
  progressBar: {
    height: 4,
    backgroundColor: '#333',
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#3b82f6',
  },
  timeContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  timeText: {
    fontSize: 12,
    color: '#888',
  },
  controls: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 24,
  },
  seekButton: {
    padding: 8,
  },
  seekButtonText: {
    color: '#888',
    fontSize: 14,
  },
  playButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#3b82f6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  playButtonText: {
    fontSize: 24,
    color: '#fff',
  },
  errorContainer: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  errorText: {
    color: '#ef4444',
    fontSize: 14,
    marginBottom: 12,
    textAlign: 'center',
  },
  retryButton: {
    backgroundColor: '#333',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 6,
  },
  retryButtonText: {
    color: '#fff',
    fontSize: 14,
  },
});
