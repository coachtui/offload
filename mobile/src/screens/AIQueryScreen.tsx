import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  FlatList,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAI, AIMessage } from '../hooks/useAI';
import { useVoiceDictation } from '../hooks/useVoiceDictation';
import { AppScreen, AppHeader, Colors, Spacing } from '../components/ui';

export default function AIQueryScreen({ navigation, route }: any) {
  const initialQuery: string | undefined = route?.params?.initialQuery;
  const [inputText, setInputText] = useState(initialQuery ?? '');
  const { messages, loading, error, askQuestion, clearConversation } = useAI();
  const {
    isDictating,
    liveTranscript,
    error: dictationError,
    start: startDictation,
    stop: stopDictation,
  } = useVoiceDictation();
  // Text that was in the box before dictation started — dictation appends, never destroys.
  const dictationBaseRef = useRef('');
  const flatListRef = useRef<FlatList>(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (messages.length > 0) {
      flatListRef.current?.scrollToEnd({ animated: true });
    }
  }, [messages]);

  // Stream the live transcript into the box while dictating (appended to prior text)
  useEffect(() => {
    if (!isDictating) return;
    const base = dictationBaseRef.current;
    setInputText(liveTranscript ? (base ? base + ' ' + liveTranscript : liveTranscript) : base);
  }, [liveTranscript, isDictating]);

  // On dictation error, restore whatever was typed before the mic was tapped
  useEffect(() => {
    if (dictationError) setInputText(dictationBaseRef.current);
  }, [dictationError]);

  // Stop dictation when the screen loses focus. Native-stack pushes keep this
  // screen mounted (e.g. the ProximityBanner navigating to PlaceSummary), so
  // unmount teardown alone would leave the mic hot behind the covering screen.
  useEffect(() => {
    const unsubscribe = navigation.addListener('blur', () => {
      if (isDictating) {
        void stopDictation();
      }
    });
    return unsubscribe;
  }, [navigation, isDictating, stopDictation]);

  const handleMicPress = async () => {
    if (loading) return;
    if (isDictating) {
      const final = await stopDictation();
      const base = dictationBaseRef.current;
      setInputText(final ? (base ? base + ' ' + final : final) : base);
    } else {
      dictationBaseRef.current = inputText.trim();
      await startDictation();
    }
  };

  const handleSend = async () => {
    if (!inputText.trim() || loading) return;

    const question = inputText.trim();
    setInputText('');

    await askQuestion(question);
  };

  const renderMessage = ({ item }: { item: AIMessage }) => {
    const isUser = item.role === 'user';

    return (
      <View style={[styles.messageContainer, isUser && styles.userMessageContainer]}>
        <View style={[styles.messageBubble, isUser ? styles.userBubble : styles.aiBubble]}>
          <Text style={[styles.messageText, isUser && styles.userMessageText]}>
            {item.content}
          </Text>

          {/* Themes */}
          {item.themes && item.themes.length > 0 && (
            <View style={styles.metaSection}>
              <Text style={styles.metaLabel}>Themes</Text>
              <View style={styles.chipRow}>
                {item.themes.map((theme) => (
                  <View key={theme} style={styles.themeChip}>
                    <Text style={styles.themeChipText}>{theme}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          {/* Gaps */}
          {item.gaps && (
            <View style={styles.metaSection}>
              <Text style={styles.metaLabel}>Gaps in your notes</Text>
              <Text style={styles.gapText}>{item.gaps}</Text>
            </View>
          )}

          {/* Cited + contradiction flag */}
          <View style={styles.messageFooter}>
            {item.citedIds && item.citedIds.length > 0 && (
              <Text style={styles.citedText}>
                {item.citedIds.length} note{item.citedIds.length !== 1 ? 's' : ''} cited
              </Text>
            )}
            {item.hasContradictions && (
              <Text style={styles.contradictionText}>⚠ Contradictions found</Text>
            )}
            <Text style={styles.timestamp}>
              {new Date(item.timestamp).toLocaleTimeString(undefined, {
                hour: '2-digit',
                minute: '2-digit',
                timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
              })}
            </Text>
          </View>
        </View>
      </View>
    );
  };

  const renderEmptyState = () => (
    <View style={styles.emptyState}>
      <Ionicons name="chatbubbles-outline" size={80} color="#C7D2FE" />
      <Text style={styles.emptyStateTitle}>Ask Offload</Text>
      <Text style={styles.emptyStateText}>
        Ask anything about your notes.
      </Text>
      <View style={styles.exampleQuestionsContainer}>
        <Text style={styles.exampleQuestionsTitle}>Try asking:</Text>
        {EXAMPLE_QUESTIONS.map((question) => (
          <TouchableOpacity
            key={question}
            style={styles.exampleQuestionChip}
            onPress={() => askQuestion(question)}
          >
            <Text style={styles.exampleQuestionText}>{question}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );

  return (
    <AppScreen>
      <AppHeader
        title="Ask Offload"
        subtitle={messages.length === 0 ? 'Ask me anything' : `${messages.length} messages`}
        left={
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Ionicons name="arrow-back" size={24} color={Colors.textSecondary} />
          </TouchableOpacity>
        }
        right={
          messages.length > 0 ? (
            <TouchableOpacity onPress={clearConversation}>
              <Ionicons name="trash-outline" size={22} color={Colors.error} />
            </TouchableOpacity>
          ) : undefined
        }
      />

      {/* Error Banner */}
      {error && (
        <View style={styles.errorBanner}>
          <Ionicons name="alert-circle" size={20} color="#DC2626" />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      {/* Messages List */}
      <KeyboardAvoidingView
        style={styles.messagesContainer}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={90}
      >
        <FlatList
          ref={flatListRef}
          data={messages}
          renderItem={renderMessage}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.messagesList}
          ListEmptyComponent={renderEmptyState}
          showsVerticalScrollIndicator={false}
          onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
        />

        {/* Loading Indicator */}
        {loading && (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="small" color="#4F46E5" />
            <Text style={styles.loadingText}>Thinking...</Text>
          </View>
        )}

        {dictationError && (
          <Text style={styles.dictationError}>{dictationError}</Text>
        )}

        {/* Input Area */}
        <View style={styles.inputContainer}>
          <TextInput
            style={styles.input}
            placeholder="Ask about your notes..."
            placeholderTextColor="#9CA3AF"
            value={inputText}
            onChangeText={setInputText}
            multiline
            maxLength={500}
            returnKeyType="send"
            onSubmitEditing={handleSend}
            editable={!loading && !isDictating}
          />
          <TouchableOpacity
            style={styles.micButton}
            onPress={handleMicPress}
            disabled={loading}
          >
            <Ionicons
              name={isDictating ? 'stop-circle' : 'mic-outline'}
              size={24}
              color={loading ? '#9CA3AF' : isDictating ? '#EF4444' : '#6B7280'}
            />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.sendButton, (!inputText.trim() || loading || isDictating) && styles.sendButtonDisabled]}
            onPress={handleSend}
            disabled={!inputText.trim() || loading || isDictating}
          >
            <Ionicons
              name="send"
              size={20}
              color={!inputText.trim() || loading || isDictating ? '#9CA3AF' : '#FFFFFF'}
            />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </AppScreen>
  );
}

const EXAMPLE_QUESTIONS = [
  'What did I say I needed at Costco?',
  'Summarize my gym notes this week.',
  'What tasks did I mention for work?',
  'What ideas have I been thinking about?',
];

const styles = StyleSheet.create({
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEE2E2',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#FECACA',
  },
  errorText: {
    flex: 1,
    fontSize: 14,
    color: '#DC2626',
    marginLeft: 8,
  },
  messagesContainer: {
    flex: 1,
  },
  messagesList: {
    paddingHorizontal: 16,
    paddingVertical: 20,
    flexGrow: 1,
  },
  messageContainer: {
    marginBottom: 16,
    alignItems: 'flex-start',
  },
  userMessageContainer: {
    alignItems: 'flex-end',
  },
  messageBubble: {
    maxWidth: '80%',
    borderRadius: 16,
    padding: 12,
  },
  userBubble: {
    backgroundColor: '#4F46E5',
    borderBottomRightRadius: 4,
  },
  aiBubble: {
    backgroundColor: '#FFFFFF',
    borderBottomLeftRadius: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  messageText: {
    fontSize: 15,
    lineHeight: 21,
    color: '#374151',
  },
  userMessageText: {
    color: '#FFFFFF',
  },
  metaSection: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  metaLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#6B7280',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  themeChip: {
    backgroundColor: '#EEF2FF',
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: '#C7D2FE',
  },
  themeChipText: { fontSize: 12, color: '#4F46E5', fontWeight: '500' },
  gapText: { fontSize: 12, color: '#6B7280', lineHeight: 18, marginTop: 2 },
  messageFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    gap: 8,
  },
  citedText: { fontSize: 11, color: '#9CA3AF' },
  contradictionText: { fontSize: 11, color: '#F59E0B', fontWeight: '600' },
  timestamp: { fontSize: 11, color: '#9CA3AF', marginLeft: 'auto' },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  emptyStateTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#111827',
    marginTop: 20,
    marginBottom: 8,
  },
  emptyStateText: {
    fontSize: 15,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 22,
  },
  exampleQuestionsContainer: {
    marginTop: 32,
    width: '100%',
  },
  exampleQuestionsTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6B7280',
    marginBottom: 12,
    textAlign: 'center',
  },
  exampleQuestionChip: {
    backgroundColor: '#EEF2FF',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#C7D2FE',
  },
  exampleQuestionText: {
    fontSize: 14,
    color: '#4F46E5',
    fontWeight: '500',
    textAlign: 'center',
  },
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
  },
  loadingText: {
    fontSize: 14,
    color: '#6B7280',
    marginLeft: 8,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  input: {
    flex: 1,
    maxHeight: 100,
    backgroundColor: '#F3F4F6',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 15,
    color: '#111827',
    marginRight: 8,
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#4F46E5',
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendButtonDisabled: {
    backgroundColor: '#E5E7EB',
  },
  micButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
  },
  dictationError: {
    color: '#DC2626',
    fontSize: 13,
    paddingHorizontal: 16,
    paddingBottom: 4,
    backgroundColor: '#FFFFFF',
  },
});
