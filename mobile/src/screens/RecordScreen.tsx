import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useDeepgramTranscription } from '../hooks/useDeepgramTranscription';
import { RootStackParamList } from '../navigation/types';

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
    relatedNotes,
    contradictions,
    startRecording,
    stopRecording,
    reset,
  } = useDeepgramTranscription();

  const isRecording = status === 'recording';
  const isConnecting = status === 'connecting';
  const isProcessing = status === 'processing';
  const isDone = status === 'done';
  const hasTranscript = finalTranscript || partialTranscript;

  async function handleRecordPress() {
    if (isRecording) {
      await stopRecording();
    } else if (status === 'idle' || status === 'done' || status === 'error') {
      await startRecording();
    }
  }

  function getStatusText(): string {
    switch (status) {
      case 'connecting':
        return 'Connecting to Deepgram...';
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
        return '#888';
    }
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.backButton}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Record</Text>
        <View style={styles.headerRight}>
          {(hasTranscript || isDone) && (
            <TouchableOpacity onPress={reset}>
              <Text style={styles.clearButton}>Clear</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      <View style={styles.statusBar}>
        <View
          style={[
            styles.statusIndicator,
            { backgroundColor: getStatusColor() },
          ]}
        />
        <Text style={styles.statusText}>{getStatusText()}</Text>
      </View>

      <ScrollView
        style={styles.transcriptContainer}
        contentContainerStyle={styles.transcriptContent}
      >
        {!hasTranscript && status === 'idle' ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyStateText}>
              Tap the record button to start capturing your thoughts
            </Text>
            <Text style={styles.emptyStateSubtext}>
              Real-time transcription powered by Deepgram
            </Text>
          </View>
        ) : (
          <View>
            {finalTranscript && (
              <Text style={styles.transcriptText}>{finalTranscript}</Text>
            )}
            {partialTranscript && (
              <Text style={styles.partialText}>{partialTranscript}</Text>
            )}
            {isRecording && !partialTranscript && !finalTranscript && (
              <View style={styles.listeningIndicator}>
                <ActivityIndicator size="small" color="#3b82f6" />
                <Text style={styles.listeningText}>Listening...</Text>
              </View>
            )}
            {isProcessing && (
              <View style={styles.listeningIndicator}>
                <ActivityIndicator size="small" color="#f59e0b" />
                <Text style={styles.processingText}>Saving transcript...</Text>
              </View>
            )}

            {/* Contradiction warning */}
            {isDone && contradictions.length > 0 && (
              <ContraDetailBanner contradictions={contradictions} navigation={navigation} />
            )}

            {/* Related notes */}
            {isDone && relatedNotes.length > 0 && (
              <View style={styles.relatedSection}>
                <Text style={styles.relatedTitle}>Related to your notes</Text>
                {relatedNotes.map((note) => (
                  <TouchableOpacity
                    key={note.objectId}
                    style={styles.relatedCard}
                    onPress={() => navigation.navigate('Objects', { objectId: note.objectId })}
                  >
                    <View style={styles.relatedCardHeader}>
                      <Text style={styles.relatedType}>{note.type}</Text>
                      <Text style={styles.relatedScore}>{Math.round(note.score * 100)}%</Text>
                    </View>
                    {note.mentionCount !== undefined && note.mentionCount >= 3 && (
                      <Text style={styles.mentionBadge}>Mentioned {note.mentionCount}× before</Text>
                    )}
                    {note.title && (
                      <Text style={styles.relatedNoteTitle} numberOfLines={1}>{note.title}</Text>
                    )}
                    <Text style={styles.relatedNoteText} numberOfLines={2}>{note.cleanedText}</Text>
                  </TouchableOpacity>
                ))}
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
          style={[
            styles.recordButton,
            isRecording && styles.recordButtonActive,
          ]}
          onPress={handleRecordPress}
          disabled={isConnecting || isProcessing}
        >
          {isConnecting || isProcessing ? (
            <ActivityIndicator size="large" color="#fff" />
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
    </SafeAreaView>
  );
}

function ContraDetailBanner({
  contradictions,
  navigation,
}: {
  contradictions: import('../services/api').ConflictItem[];
  navigation: any;
}) {
  const [expandedIdx, setExpandedIdx] = React.useState<number | null>(null);
  return (
    <View style={styles.contradictionBanner}>
      <Text style={styles.contradictionTitle}>⚠ Possible contradiction</Text>
      {contradictions.slice(0, 2).map((c, i) => (
        <View key={i}>
          <TouchableOpacity onPress={() => setExpandedIdx(expandedIdx === i ? null : i)}>
            <Text style={styles.contradictionText}>{c.description}</Text>
          </TouchableOpacity>
          {expandedIdx === i && (
            <View style={styles.contradictionDetail}>
              <Text style={styles.contradictionConfidence}>
                Confidence: {Math.round(c.confidence * 100)}%
              </Text>
              <View style={styles.contradictionActions}>
                <TouchableOpacity
                  style={styles.contradictionActionBtn}
                  onPress={() => navigation.navigate('Objects', { objectId: c.objectId })}
                >
                  <Text style={styles.contradictionActionText}>View note</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.contradictionActionBtn, styles.contradictionActionBtnPrimary]}
                  onPress={() => setExpandedIdx(null)}
                >
                  <Text style={[styles.contradictionActionText, { color: '#fff' }]}>Changed my mind</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0a',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#1a1a1a',
  },
  backButton: {
    color: '#3b82f6',
    fontSize: 16,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
  },
  headerRight: {
    minWidth: 50,
    alignItems: 'flex-end',
  },
  clearButton: {
    color: '#888',
    fontSize: 14,
  },
  statusBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 12,
    backgroundColor: '#111',
  },
  statusIndicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 8,
  },
  statusText: {
    color: '#888',
    fontSize: 12,
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
  },
  emptyStateText: {
    color: '#666',
    fontSize: 16,
    textAlign: 'center',
  },
  emptyStateSubtext: {
    color: '#444',
    fontSize: 12,
    textAlign: 'center',
    marginTop: 8,
  },
  transcriptText: {
    color: '#fff',
    fontSize: 18,
    lineHeight: 28,
  },
  partialText: {
    color: '#666',
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
  errorContainer: {
    backgroundColor: '#7f1d1d',
    paddingHorizontal: 24,
    paddingVertical: 12,
  },
  errorText: {
    color: '#fca5a5',
    fontSize: 14,
  },
  controlsContainer: {
    alignItems: 'center',
    paddingVertical: 32,
    paddingBottom: 48,
    borderTopWidth: 1,
    borderTopColor: '#1a1a1a',
  },
  recordButton: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#1a1a1a',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 4,
    borderColor: '#333',
  },
  recordButtonActive: {
    borderColor: '#ef4444',
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
    color: '#666',
    fontSize: 14,
    marginTop: 16,
  },
  contradictionBanner: {
    marginTop: 20,
    backgroundColor: '#2d1a00',
    borderRadius: 10,
    padding: 14,
    borderWidth: 1,
    borderColor: '#f59e0b44',
  },
  contradictionTitle: {
    color: '#f59e0b',
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 6,
  },
  contradictionText: {
    color: '#d97706',
    fontSize: 13,
    lineHeight: 18,
    marginTop: 2,
  },
  contradictionDetail: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#f59e0b22',
  },
  contradictionConfidence: {
    color: '#888',
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
    borderColor: '#f59e0b44',
  },
  contradictionActionBtnPrimary: {
    backgroundColor: '#f59e0b',
    borderColor: '#f59e0b',
  },
  contradictionActionText: {
    color: '#f59e0b',
    fontSize: 12,
    fontWeight: '600',
  },
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
    color: '#666',
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 10,
  },
  relatedCard: {
    backgroundColor: '#141414',
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#222',
  },
  relatedCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  relatedType: {
    color: '#555',
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
    color: '#ccc',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 2,
  },
  relatedNoteText: {
    color: '#666',
    fontSize: 13,
    lineHeight: 18,
  },
});
