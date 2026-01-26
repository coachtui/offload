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
import { useVoice } from '../hooks/useVoice';
import { RootStackParamList } from '../navigation/types';

type RecordScreenNavigationProp = NativeStackNavigationProp<RootStackParamList, 'Record'>;

interface Props {
  navigation: RecordScreenNavigationProp;
}

export function RecordScreen({ navigation }: Props) {
  const {
    isRecording,
    isConnected,
    isConnecting,
    transcripts,
    error,
    startRecording,
    stopRecording,
    clearTranscripts,
  } = useVoice();

  async function handleRecordPress() {
    if (isRecording) {
      await stopRecording();
    } else {
      await startRecording();
    }
  }

  function getFullTranscript(): string {
    return transcripts
      .filter(t => !t.partial)
      .map(t => t.text)
      .join(' ');
  }

  function getLatestPartial(): string {
    const partial = transcripts.find(t => t.partial);
    return partial?.text || '';
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.backButton}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Record</Text>
        <View style={styles.headerRight}>
          {transcripts.length > 0 && (
            <TouchableOpacity onPress={clearTranscripts}>
              <Text style={styles.clearButton}>Clear</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      <View style={styles.statusBar}>
        <View
          style={[
            styles.statusIndicator,
            isConnected ? styles.statusConnected : styles.statusDisconnected,
          ]}
        />
        <Text style={styles.statusText}>
          {isConnecting
            ? 'Connecting...'
            : isConnected
            ? 'Connected'
            : 'Disconnected'}
        </Text>
      </View>

      <ScrollView
        style={styles.transcriptContainer}
        contentContainerStyle={styles.transcriptContent}
      >
        {transcripts.length === 0 && !isRecording ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyStateText}>
              Tap the record button to start capturing your thoughts
            </Text>
          </View>
        ) : (
          <View>
            <Text style={styles.transcriptText}>{getFullTranscript()}</Text>
            {getLatestPartial() && (
              <Text style={styles.partialText}>{getLatestPartial()}</Text>
            )}
            {isRecording && (
              <View style={styles.listeningIndicator}>
                <ActivityIndicator size="small" color="#3b82f6" />
                <Text style={styles.listeningText}>Listening...</Text>
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
          disabled={isConnecting}
        >
          {isConnecting ? (
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
          {isRecording ? 'Tap to stop' : 'Tap to record'}
        </Text>
      </View>
    </SafeAreaView>
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
  statusConnected: {
    backgroundColor: '#22c55e',
  },
  statusDisconnected: {
    backgroundColor: '#ef4444',
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
});
