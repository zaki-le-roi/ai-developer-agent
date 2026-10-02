import { DarkTheme, ThemeProvider, type ErrorBoundaryProps, Stack } from 'expo-router';
import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { StyleSheet, Text, View } from 'react-native';

export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  return (
    <View style={styles.error}>
      <Text style={styles.title}>حدث خطأ في تشغيل BMZ AI</Text>
      <Text style={styles.message}>{error.message}</Text>
      <Text style={styles.retry} onPress={retry}>إعادة المحاولة</Text>
    </View>
  );
}

export default function RootLayout() {
  return (
    <ThemeProvider value={DarkTheme}>
      <StatusBar style="light" backgroundColor="#080808" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: '#080808' },
        }}
      />
    </ThemeProvider>
  );
}

const styles = StyleSheet.create({
  error: { flex: 1, backgroundColor: '#080808', padding: 24, justifyContent: 'center' },
  title: { color: '#fff', fontSize: 20, fontWeight: '800', textAlign: 'right', marginBottom: 12 },
  message: { color: '#ffb4b4', fontSize: 13, textAlign: 'right', marginBottom: 20 },
  retry: { color: '#080808', backgroundColor: '#fff', padding: 12, borderRadius: 10, textAlign: 'center', fontWeight: '800' },
});
