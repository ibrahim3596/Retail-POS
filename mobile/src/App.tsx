// App entry point
import React, { useEffect, useState } from 'react';
import { View, Text, ActivityIndicator, StyleSheet } from 'react-native';
import { AppNavigator } from './navigation/AppNavigator';
import { initDatabase } from './shared/database/sqlite';
import { useAuthStore } from './modules/auth/store';
import { startAutoSync } from './modules/sync/engine';

export default function App() {
  const [isLoading, setIsLoading] = useState(true);
  const [dbReady, setDbReady] = useState(false);
  const { checkAuth, isAuthenticated } = useAuthStore();

  useEffect(() => {
    initializeApp();
  }, []);

  async function initializeApp() {
    try {
      // Initialize offline database
      await initDatabase();
      setDbReady(true);

      // Check existing auth
      await checkAuth();

      // Start automatic background sync
      startAutoSync((result) => {
        if (result.success > 0) {
          console.log(`Synced ${result.success} items`);
        }
      });
    } catch (error) {
      console.error('App initialization failed:', error);
    } finally {
      setIsLoading(false);
    }
  }

  if (isLoading || !dbReady) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#2196F3" />
        <Text style={styles.loadingText}>Loading RetailPOS...</Text>
      </View>
    );
  }

  return <AppNavigator />;
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#666',
  },
});
