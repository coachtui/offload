import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useDeepgramTranscription } from '../hooks/useDeepgramTranscription';
import { useGeofences } from '../hooks/useGeofences';
import { RootStackParamList } from '../navigation/types';
import { AppScreen, AppHeader, Colors } from '../components/ui';
import { locationService } from '../services/locationService';

type RecordScreenNavigationProp = NativeStackNavigationProp<RootStackParamList, 'Record'>;

interface Props {
  navigation: RecordScreenNavigationProp;
}

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

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
  } = useDeepgramTranscription();

  const { fetchGeofences } = useGeofences();

  const isRecording = status === 'recording';
  const isConnecting = status === 'connecting';
  const isProcessing = status === 'processing';
  const isDone = status === 'done';
  const hasTranscript = finalTranscript || partialTranscript;

  async function handleRecordPress() {
    if (isRecording) {
      await stopRecording({
        // Geofence re-sync: schedule here (inside the background save callback) so it
        // fires even after RecordScreen has been popped from the stack on navigation.
        onGeofencesNeeded: () => {
          console.log('[RecordScreen] Geofence candidates detected — scheduling re-sync in 6s (persists through navigation)');
          setTimeout(() => {
            console.log('[RecordScreen] Re-fetching geofences to pick up inferred places');
            fetchGeofences();
          }, 6000);
        },
      });
      navigation.navigate('Home');
      return;
    } else if (status === 'idle' || status === 'done' || status === 'error') {
      const loc = await locationService.getCurrentLocation();
      const geoPoint = loc
        ? { latitude: loc.coords.latitude, longitude: loc.coords.longitude, accuracy: loc.coords.accuracy ?? undefined }
        : undefined;
      await startRecording(geoPoint);
    }
  }

  function getStatusText(): string {
    switch (status) {
      case 'connecting':
        return 'Starting recording...';
      case 'recording':
        return `Recording ${formatDuration(duration)}`;
      case 'processing':
        return 'Saving...';
      case 'done':
        return savedObjectIds.length > 0
          ? `Saved ${savedObjectIds.length} item${savedObjectIds.length > 1 ? 's' : ''}`
          : 'Done';
      case 'error':
        return 'Error';
      default:
        return 'Ready';
    }
  }

  function getStatusColor(): string {
    switch (status) {
      case 'recording':
        return '#22c55e';
      case 'connecting':
      case 'processing':
        return '#f59e0b';
      case 'error':
        return '#ef4444';
      default:
        return '#9CA3AF';
    }
  }

  return (
    <AppScreen>
      <AppHeader
        title="Record"
        left={
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Ionicons name="arrow-back" size={24} color={Colors.textSecondary} />
          </TouchableOpacity>
        }
        right={
          (hasTranscript || isDone) ? (
            <TouchableOpacity onPress={reset}>
              <Text style={styles.clearButton}>Clear</Text>
            </TouchableOpacity>
          ) : undefined
        }
      />

      <View style={styles.statusBar}>
        <View style={[styles.statusIndicator, { backgroundColor: getStatusColor() }]} />
        <Text style={styles.statusText}>{getStatusText()}</Text>
      </View>

      <ScrollView
        style={styles.transcriptContainer}
        contentContainerStyle={styles.transcriptContent}
      >
        {!hasTranscript && status === 'idle' ? (
          <View style={styles.emptyState}>
            <Ionicons name="mic-outline" size={52} color="#D1D5DB" style={{ marginBottom: 16 }} />
            <Text style={styles.emptyStateText}>
              Tap the record button to start capturing your thoughts
            </Text>
            <Text style={styles.emptyStateSubtext}>
              Real-time transcription powered by Deepgram
            </Text>
          </View>
        ) : (
          <View>
            {finalTranscript ? (
              <Text style={styles.transcriptText}>{finalTranscript}</Text>
            ) : null}
            {partialTranscript ? (
              <Text style={styles.partialText}>{partialTranscript}</Text>
            ) : null}
            {isRecording && !partialTranscript && !finalTranscript && (
              <View style={styles.listeningIndicator}>
                <ActivityIndicator size="small" color="#3b82f6" />
                <Text style={styles.listeningText}>Listening...</Text>
              </View>
            )}
            {isEnhancing && (
              <View style={styles.listeningIndicator}>
                <ActivityIndicator size="small" color="#7c3aed" />
                <Text style={styles.enhancingText}>Improving transcript…</Text>
              </View>
            )}
            {isProcessing && !isEnhancing && (
              <View style={styles.listeningIndicator}>
                <ActivityIndicator size="small" color="#f59e0b" />
                <Text style={styles.processingText}>Saving transcript...</Text>
              </View>
            )}
          </View>
        )}
      </ScrollView>

      {error && (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      <View style={styles.controlsContainer}>
        <TouchableOpacity
          style={[styles.recordButton, isRecording && styles.recordButtonActive]}
          onPress={handleRecordPress}
          disabled={isConnecting || isProcessing}
        >
          {isConnecting || isProcessing ? (
            <ActivityIndicator size="large" color="#111827" />
          ) : (
            <View
              style={[
                styles.recordButtonInner,
                isRecording && styles.recordButtonInnerActive,
              ]}
            />
          )}
        </TouchableOpacity>
        <Text style={styles.recordHint}>
          {isRecording
            ? 'Tap to stop'
            : isConnecting
            ? 'Connecting...'
            : isProcessing
            ? 'Saving...'
            : 'Tap to record'}
        </Text>
      </View>
    </AppScreen>
  );
}


const styles = StyleSheet.create({
  clearButton: {
    color: '#6B7280',
    fontSize: 14,
  },
  statusBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 10,
    backgroundColor: '#F9FAFB',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#F3F4F6',
  },
  statusIndicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 8,
  },
  statusText: {
    color: '#6B7280',
    fontSize: 13,
  },
  transcriptContainer: {
    flex: 1,
  },
  transcriptContent: {
    padding: 24,
    flexGrow: 1,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 48,
    paddingTop: 40,
  },
  emptyStateText: {
    color: '#6B7280',
    fontSize: 16,
    textAlign: 'center',
    lineHeight: 24,
  },
  emptyStateSubtext: {
    color: '#9CA3AF',
    fontSize: 13,
    textAlign: 'center',
    marginTop: 8,
  },
  transcriptText: {
    color: '#111827',
    fontSize: 18,
    lineHeight: 28,
  },
  partialText: {
    color: '#9CA3AF',
    fontSize: 18,
    lineHeight: 28,
    fontStyle: 'italic',
  },
  listeningIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 16,
    gap: 8,
  },
  listeningText: {
    color: '#3b82f6',
    fontSize: 14,
  },
  processingText: {
    color: '#f59e0b',
    fontSize: 14,
  },
  enhancingText: {
    color: '#7c3aed',
    fontSize: 14,
  },
  enhancedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 4,
    backgroundColor: '#F3E8FF',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    marginBottom: 8,
  },
  enhancedBadgeText: {
    color: '#7c3aed',
    fontSize: 11,
    fontWeight: '600',
  },
  errorContainer: {
    backgroundColor: '#FEE2E2',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: '#FECACA',
  },
  errorText: {
    color: '#DC2626',
    fontSize: 14,
  },
  controlsContainer: {
    alignItems: 'center',
    paddingVertical: 32,
    paddingBottom: 40,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#E5E7EB',
    backgroundColor: '#FFFFFF',
  },
  recordButton: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#F9FAFB',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#E5E7EB',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  recordButtonActive: {
    borderColor: '#ef4444',
    borderWidth: 3,
  },
  recordButtonInner: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#ef4444',
  },
  recordButtonInnerActive: {
    width: 24,
    height: 24,
    borderRadius: 4,
  },
  recordHint: {
    color: '#6B7280',
    fontSize: 14,
    marginTop: 14,
  },
  // Contradiction banner
  contradictionBanner: {
    marginTop: 20,
    backgroundColor: '#FEF3C7',
    borderRadius: 10,
    padding: 14,
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  contradictionTitle: {
    color: '#92400E',
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 6,
  },
  contradictionText: {
    color: '#B45309',
    fontSize: 13,
    lineHeight: 18,
    marginTop: 2,
  },
  contradictionDetail: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#FDE68A',
  },
  contradictionConfidence: {
    color: '#6B7280',
    fontSize: 11,
    marginBottom: 8,
  },
  contradictionActions: {
    flexDirection: 'row',
    gap: 8,
  },
  contradictionActionBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#F59E0B',
  },
  contradictionActionBtnPrimary: {
    backgroundColor: '#F59E0B',
    borderColor: '#F59E0B',
  },
  contradictionActionText: {
    color: '#B45309',
    fontSize: 12,
    fontWeight: '600',
  },
  // Related notes
  mentionBadge: {
    color: '#6366f1',
    fontSize: 11,
    fontWeight: '600',
    marginBottom: 2,
  },
  relatedSection: {
    marginTop: 24,
  },
  relatedTitle: {
    color: '#6B7280',
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 10,
  },
  relatedCard: {
    backgroundColor: '#F9FAFB',
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#E5E7EB',
  },
  relatedCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  relatedType: {
    color: '#6B7280',
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  relatedScore: {
    color: '#4F46E5',
    fontSize: 11,
    fontWeight: '600',
  },
  relatedNoteTitle: {
    color: '#374151',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 2,
  },
  relatedNoteText: {
    color: '#6B7280',
    fontSize: 13,
    lineHeight: 18,
  },
});
