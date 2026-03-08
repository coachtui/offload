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
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAI, AIMessage } from '../hooks/useAI';

export default function AIQueryScreen({ navigation }: any) {
  const [inputText, setInputText] = useState('');
  const { messages, loading, error, askQuestion, clearConversation } = useAI();
  const flatListRef = useRef<FlatList>(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (messages.length > 0) {
      flatListRef.current?.scrollToEnd({ animated: true });
    }
  }, [messages]);

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
      <Text style={styles.emptyStateTitle}>AI Assistant</Text>
      <Text style={styles.emptyStateText}>
        Ask me anything about your voice notes!
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
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color="#374151" />
        </TouchableOpacity>
        <View style={styles.headerTitleContainer}>
          <Text style={styles.headerTitle}>AI Assistant</Text>
          <Text style={styles.headerSubtitle}>
            {messages.length === 0 ? 'Ask me anything' : `${messages.length} messages`}
          </Text>
        </View>
        {messages.length > 0 && (
          <TouchableOpacity onPress={clearConversation}>
            <Ionicons name="trash-outline" size={22} color="#EF4444" />
          </TouchableOpacity>
        )}
      </View>

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
            editable={!loading}
          />
          <TouchableOpacity
            style={[styles.sendButton, (!inputText.trim() || loading) && styles.sendButtonDisabled]}
            onPress={handleSend}
            disabled={!inputText.trim() || loading}
          >
            <Ionicons
              name="send"
              size={20}
              color={!inputText.trim() || loading ? '#9CA3AF' : '#FFFFFF'}
            />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const EXAMPLE_QUESTIONS = [
  'What workout plans do I have?',
  'Summarize my recent meetings',
  'What health-related notes have I recorded?',
  'Show me tasks I need to do',
];

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  headerTitleContainer: {
    flex: 1,
    marginLeft: 16,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
  },
  headerSubtitle: {
    fontSize: 13,
    color: '#6B7280',
    marginTop: 2,
  },
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
});
