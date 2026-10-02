import React, { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://192.168.1.119:4000';

type Message = {
  id: number;
  role: 'user' | 'agent';
  text: string;
};

type AgentResponse = {
  success?: boolean;
  plan?: { steps?: { title: string; status?: string }[] };
  execution?: {
    message?: string;
    iterations?: number;
    observations?: { action: string; ok: boolean; summary: string }[];
  };
  error?: string;
  assistantMessage?: string;
  approval?: { id: string; action: string; reason: string; expiresAt: string; approved: boolean };
};

const suggestions = [
  'أنشئ لي تطبيقًا جديدًا',
  'حلّل مشروعي واكتشف المشاكل',
  'أصلح الأخطاء في المشروع',
];

function formatExecution(data: AgentResponse): string {
  const lines: string[] = [];
  if (data.execution?.message) lines.push(data.execution.message);
  if (typeof data.execution?.iterations === 'number') {
    lines.push(`عدد دورات التنفيذ: ${data.execution.iterations}`);
  }
  const observations = data.execution?.observations ?? [];
  if (observations.length) {
    lines.push(
      '\nنتيجة العمليات:',
      ...observations.map(
        (item, index) => `${index + 1}. ${item.ok ? '✓' : '✗'} ${item.summary}`,
      ),
    );
  }
  if (data.assistantMessage) lines.push(`\n${data.assistantMessage}`);
  return lines.join('\n');
}

export default function HomeScreen() {
  const [message, setMessage] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [sending, setSending] = useState(false);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [repositoryUrl, setRepositoryUrl] = useState('');
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [pendingApproval, setPendingApproval] = useState<AgentResponse['approval']>(undefined);

  async function sendMessage(overrideApprovalToken?: string, overrideMessage?: string) {
    const cleanMessage = (overrideMessage ?? message).trim();
    if (!cleanMessage || sending) return;

    setMessages((current) => [
      ...current,
      { id: Date.now(), role: 'user', text: cleanMessage },
    ]);
    setMessage('');
    setSending(true);

    try {
      let activeProjectId = projectId;
      let activeSessionId = sessionId;
      if (!activeProjectId) {
        const endpoint = repositoryUrl.trim()
          ? `${API_URL}/api/projects/import-github`
          : `${API_URL}/api/projects`;
        const projectResponse = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: repositoryUrl.trim() ? 'مشروع GitHub في BMZ AI' : 'مشروعي في BMZ AI',
            ...(repositoryUrl.trim() ? { repositoryUrl: repositoryUrl.trim() } : {}),
          }),
        });
        const projectData = (await projectResponse.json()) as { project?: { id?: string } };
        if (!projectResponse.ok || !projectData.project?.id) {
          throw new Error('تعذر إنشاء مساحة المشروع.');
        }
        activeProjectId = projectData.project.id;
        setProjectId(activeProjectId);
      }

      if (!activeSessionId) {
        const sessionResponse = await fetch(`${API_URL}/api/sessions`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ projectId: activeProjectId }),
        });
        const sessionData = (await sessionResponse.json()) as { session?: { id?: string } };
        if (!sessionResponse.ok || !sessionData.session?.id) throw new Error('تعذر إنشاء جلسة BMZ AI.');
        activeSessionId = sessionData.session.id;
        setSessionId(activeSessionId);
      }

      const response = await fetch(`${API_URL}/api/agent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: cleanMessage,
          projectId: activeProjectId,
          sessionId: activeSessionId,
          ...(overrideApprovalToken ? { permissionLevel: 'approval_required', approvalToken: overrideApprovalToken } : {}),
        }),
      });

      const data = (await response.json()) as AgentResponse;

      if (data.approval) {
        setPendingApproval(data.approval);
        setMessages((current) => [...current, { id: Date.now() + 1, role: 'agent', text: `مطلوب موافقة قبل التنفيذ.

${data.approval.reason}` }]);
        return;
      }
      if (!response.ok || !data.success) throw new Error(data.error || data.execution?.message || 'تعذر تنفيذ الطلب.');

      const steps = data.plan?.steps ?? [];
      const planText = steps.length
        ? `خطة التنفيذ:\n${steps
            .map((step, index) => `${index + 1}. ${step.title} — ${step.status ?? 'pending'}`)
            .join('\n')}`
        : 'تم استلام المهمة.';

      setMessages((current) => [
        ...current,
        {
          id: Date.now() + 1,
          role: 'agent',
          text: `${planText}\n\n${formatExecution(data)}`,
        },
      ]);
    } catch (error) {
      const text =
        error instanceof Error
          ? error.message
          : 'حدث خطأ أثناء الاتصال بالـ Backend.';

      setMessages((current) => [
        ...current,
        { id: Date.now() + 1, role: 'agent', text: `خطأ: ${text}` },
      ]);
    } finally {
      setSending(false);
    }
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="light-content" backgroundColor="#0A0A0A" />
      <KeyboardAvoidingView
        style={styles.keyboardView}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.header}>
          <View>
            <Text style={styles.brand}>BMZ AI</Text>
            <Text style={styles.subtitle}>مساعدك الذكي لبناء وإدارة المشاريع</Text>
          </View>
          <View style={styles.statusContainer}>
            <View style={styles.statusDot} />
            <Text style={styles.statusText}>{sending ? 'يعمل' : 'جاهز'}</Text>
          </View>
        </View>

        <ScrollView
          style={styles.messages}
          contentContainerStyle={[
            styles.messagesContent,
            messages.length === 0 && styles.emptyMessages,
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {messages.length === 0 ? (
            <View style={styles.welcome}>
              <View style={styles.logo}>
                <Text style={styles.logoText}>BMZ</Text>
              </View>
              <Text style={styles.welcomeTitle}>ماذا تريد أن أبني لك؟</Text>
              <Text style={styles.welcomeDescription}>
                أخبرني بما تريد، وسأفهم المهمة، أضع الخطة، أنفذها، أختبر النتيجة،
                وأتعامل مع الأخطاء.
              </Text>
              <View style={styles.suggestions}>
                {suggestions.map((item) => (
                  <Pressable key={item} style={styles.suggestion} onPress={() => setMessage(item)}>
                    <Text style={styles.suggestionText}>{item}</Text>
                    <Text style={styles.suggestionArrow}>‹</Text>
                  </Pressable>
                ))}
              </View>
              <TextInput
                value={repositoryUrl}
                onChangeText={setRepositoryUrl}
                placeholder="رابط GitHub اختياري (https://github.com/...)"
                placeholderTextColor="#666666"
                style={styles.repositoryInput}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
                textAlign="right"
              />
            </View>
          ) : (
            <View style={styles.conversation}>
              {messages.map((item) => (
                <View
                  key={item.id}
                  style={[styles.messageRow, item.role === 'user' && styles.userMessageRow]}
                >
                  {item.role === 'agent' && (
                    <View style={styles.smallLogo}>
                      <Text style={styles.smallLogoText}>BMZ</Text>
                    </View>
                  )}
                  <View
                    style={[
                      styles.messageBubble,
                      item.role === 'user' ? styles.userBubble : styles.agentBubble,
                    ]}
                  >
                    <Text style={[styles.messageText, item.role === 'user' && styles.userText]}>
                      {item.text}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          )}
        </ScrollView>


        {pendingApproval && (
          <View style={styles.approvalCard}>
            <Text style={styles.approvalTitle}>موافقة مطلوبة</Text>
            <Text style={styles.approvalText}>{pendingApproval.reason}</Text>
            <Pressable
              style={styles.approvalButton}
              onPress={async () => {
                try {
                  const approved = await fetch(`${API_URL}/api/approvals/${pendingApproval.id}/approve`, { method: 'POST' });
                  const result = await approved.json() as { success?: boolean };
                  if (!approved.ok || !result.success) throw new Error('تعذر تسجيل الموافقة.');
                  const lastUserMessage = messages.filter((item) => item.role === 'user').at(-1)?.text ?? '';
                  setPendingApproval(undefined);
                  await sendMessage(pendingApproval.id, lastUserMessage);
                } catch (error) {
                  setMessages((current) => [...current, { id: Date.now(), role: 'agent', text: error instanceof Error ? error.message : 'تعذر تسجيل الموافقة.' }]);
                }
              }}
            >
              <Text style={styles.approvalButtonText}>موافقة</Text>
            </Pressable>
          </View>
        )}
        <View style={styles.inputArea}>
          <View style={styles.inputContainer}>
            <TextInput
              value={message}
              onChangeText={setMessage}
              placeholder="اكتب ما تريد من BMZ AI..."
              placeholderTextColor="#777777"
              style={styles.input}
              multiline
              textAlign="right"
              editable={!sending}
            />
            <Pressable
              style={[styles.sendButton, (!message.trim() || sending) && styles.sendButtonDisabled]}
              onPress={() => { void sendMessage(); }}
              disabled={!message.trim() || sending}
            >
              <Text style={styles.sendIcon}>{sending ? '…' : '↑'}</Text>
            </Pressable>
          </View>
          <Text style={styles.securityText}>
            BMZ AI ينفذ العمليات الحساسة وفق الصلاحيات الممنوحة له.
          </Text>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#0A0A0A' },
  keyboardView: { flex: 1 },
  header: {
    minHeight: 76, paddingHorizontal: 20, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: '#1D1D1D',
    flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between',
  },
  brand: { color: '#FFFFFF', fontSize: 22, fontWeight: '800', textAlign: 'right' },
  subtitle: { color: '#858585', fontSize: 12, marginTop: 3, textAlign: 'right' },
  statusContainer: { flexDirection: 'row-reverse', alignItems: 'center', gap: 7 },
  statusDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#45D483' },
  statusText: { color: '#A0A0A0', fontSize: 12 },
  messages: { flex: 1 },
  messagesContent: { paddingHorizontal: 18, paddingVertical: 24 },
  emptyMessages: { flexGrow: 1, justifyContent: 'center' },
  welcome: { alignItems: 'center', width: '100%', maxWidth: 560, alignSelf: 'center' },
  logo: {
    width: 72, height: 72, borderRadius: 22, backgroundColor: '#FFFFFF',
    alignItems: 'center', justifyContent: 'center', marginBottom: 22,
  },
  logoText: { color: '#0A0A0A', fontSize: 18, fontWeight: '900', letterSpacing: 1 },
  welcomeTitle: { color: '#FFFFFF', fontSize: 29, fontWeight: '800', textAlign: 'center', marginBottom: 12 },
  welcomeDescription: { color: '#8E8E8E', fontSize: 15, lineHeight: 24, textAlign: 'center', marginBottom: 26 },
  suggestions: { width: '100%', gap: 9 },
  suggestion: {
    minHeight: 50, paddingHorizontal: 16, borderRadius: 14,
    backgroundColor: '#121212', borderWidth: 1, borderColor: '#202020',
    flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between',
  },
  suggestionText: { color: '#D5D5D5', fontSize: 13, textAlign: 'right' },
  suggestionArrow: { color: '#777777', fontSize: 22, transform: [{ rotate: '180deg' }] },
  repositoryInput: {
    width: '100%', minHeight: 50, marginTop: 12, paddingHorizontal: 15, borderRadius: 14,
    backgroundColor: '#101010', borderWidth: 1, borderColor: '#202020', color: '#FFFFFF', fontSize: 13,
  },
  conversation: { gap: 18 },
  messageRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 9 },
  userMessageRow: { flexDirection: 'row-reverse' },
  smallLogo: {
    width: 30, height: 30, borderRadius: 9, backgroundColor: '#FFFFFF',
    alignItems: 'center', justifyContent: 'center',
  },
  smallLogoText: { color: '#0A0A0A', fontSize: 8, fontWeight: '900' },
  messageBubble: { maxWidth: '82%', borderRadius: 17, paddingHorizontal: 15, paddingVertical: 12 },
  userBubble: { backgroundColor: '#FFFFFF', borderBottomRightRadius: 5 },
  agentBubble: { backgroundColor: '#171717', borderWidth: 1, borderColor: '#252525', borderBottomLeftRadius: 5 },
  messageText: { fontSize: 14, lineHeight: 22, color: '#FFFFFF', textAlign: 'right' },
  userText: { color: '#0A0A0A' },
  approvalCard: { paddingHorizontal: 14, paddingTop: 10 },
  approvalTitle: { color: '#FFFFFF', fontSize: 15, fontWeight: '800', textAlign: 'right', marginBottom: 5 },
  approvalText: { color: '#AAAAAA', fontSize: 12, lineHeight: 19, textAlign: 'right', marginBottom: 9 },
  approvalButton: { minHeight: 44, borderRadius: 13, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' },
  approvalButtonText: { color: '#0A0A0A', fontWeight: '800' },
  inputArea: {
    paddingHorizontal: 14, paddingTop: 10, paddingBottom: 10,
    borderTopWidth: 1, borderTopColor: '#1D1D1D', backgroundColor: '#0A0A0A',
  },
  inputContainer: {
    minHeight: 58, maxHeight: 140, borderRadius: 18, backgroundColor: '#151515',
    borderWidth: 1, borderColor: '#292929', flexDirection: 'row-reverse',
    alignItems: 'flex-end', padding: 7,
  },
  input: { flex: 1, color: '#FFFFFF', fontSize: 15, lineHeight: 22, maxHeight: 120, paddingHorizontal: 11, paddingVertical: 9 },
  sendButton: {
    width: 44, height: 44, borderRadius: 14, backgroundColor: '#FFFFFF',
    alignItems: 'center', justifyContent: 'center',
  },
  sendButtonDisabled: { backgroundColor: '#292929' },
  sendIcon: { color: '#0A0A0A', fontSize: 24, fontWeight: '700', lineHeight: 25 },
  securityText: { color: '#555555', fontSize: 10, textAlign: 'center', marginTop: 7 },
});
