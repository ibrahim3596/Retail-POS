// Voice Billing screen
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
} from 'react-native';
import apiClient from '../../shared/api/client';
import { useBillingStore } from '../../modules/billing/store';

interface CommandHelp {
  command: string;
  description: string;
}

export function VoiceBillingScreen() {
  const [isListening, setIsListening] = useState(false);
  const [lastCommand, setLastCommand] = useState<string>('');
  const [lastResponse, setLastResponse] = useState<string>('');
  const [commands, setCommands] = useState<CommandHelp[]>([]);
  const { addToCart, removeFromCart, clearCart } = useBillingStore();

  useEffect(() => {
    loadCommands();
  }, []);

  const loadCommands = async () => {
    try {
      const response = await apiClient.get('/voice/commands');
      setCommands(response.data.data);
    } catch {
      // Use default commands if API fails
      setCommands([
        { command: 'Add [quantity] [product]', description: 'Add item to cart' },
        { command: 'Remove [product]', description: 'Remove item from cart' },
        { command: 'Complete sale [payment]', description: 'Complete the sale' },
        { command: 'Clear cart', description: 'Clear all items' },
      ]);
    }
  };

  const startListening = async () => {
    setIsListening(true);
    setLastCommand('');
    setLastResponse('Listening...');

    try {
      // In production, use react-native-voice or @react-native-voice/voice
      // For now, simulate with a prompt
      Alert.alert(
        'Voice Command',
        'In production, this would activate the microphone. Type your command:',
        [
          { text: 'Cancel', onPress: () => setIsListening(false) },
        ]
      );
    } catch (error) {
      setLastResponse('Failed to start voice recognition');
    } finally {
      setIsListening(false);
    }
  };

  const processCommand = async (text: string) => {
    setLastCommand(text);
    setLastResponse('Processing...');

    try {
      const response = await apiClient.post('/voice/process', { text });
      const result = response.data.data;

      setLastResponse(result.message);

      // Execute action based on command
      if (result.command.type === 'ADD_ITEM' && result.command.productName) {
        // Product would be found and added to cart
        Alert.alert('Voice Command', result.message);
      } else if (result.command.type === 'REMOVE_ITEM' && result.command.productName) {
        removeFromCart(result.command.productName);
      } else if (result.command.type === 'CLEAR_CART') {
        clearCart();
      } else if (result.command.type === 'COMPLETE_SALE') {
        Alert.alert('Voice Command', result.message);
      }
    } catch (error) {
      setLastResponse('Failed to process command');
    }
  };

  return (
    <ScrollView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Voice Billing</Text>
        <Text style={styles.subtitle}>
          Use voice commands to quickly add items and complete sales
        </Text>
      </View>

      {/* Microphone Button */}
      <TouchableOpacity
        style={[styles.micButton, isListening && styles.micButtonActive]}
        onPress={startListening}
        disabled={isListening}
      >
        {isListening ? (
          <ActivityIndicator size="large" color="#fff" />
        ) : (
          <Text style={styles.micIcon}>🎤</Text>
        )}
      </TouchableOpacity>

      <Text style={styles.micHint}>
        {isListening ? 'Listening...' : 'Tap to speak'}
      </Text>

      {/* Last Command Display */}
      {lastCommand && (
        <View style={styles.commandCard}>
          <Text style={styles.commandLabel}>You said:</Text>
          <Text style={styles.commandText}>"{lastCommand}"</Text>
        </View>
      )}

      {/* Response Display */}
      {lastResponse && (
        <View style={styles.responseCard}>
          <Text style={styles.responseLabel}>Response:</Text>
          <Text style={styles.responseText}>{lastResponse}</Text>
        </View>
      )}

      {/* Command Help */}
      <View style={styles.helpSection}>
        <Text style={styles.helpTitle}>Available Commands</Text>
        {commands.map((cmd, index) => (
          <TouchableOpacity
            key={index}
            style={styles.commandHelpItem}
            onPress={() => processCommand(cmd.command)}
          >
            <Text style={styles.commandHelpText}>{cmd.command}</Text>
            <Text style={styles.commandHelpDesc}>{cmd.description}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Tips */}
      <View style={styles.tipsSection}>
        <Text style={styles.tipsTitle}>💡 Tips</Text>
        <Text style={styles.tipText}>• Speak clearly and at normal pace</Text>
        <Text style={styles.tipText}>• Use product names as stored in inventory</Text>
        <Text style={styles.tipText}>• Say "add [quantity] [product]" to add items</Text>
        <Text style={styles.tipText}>• Say "complete sale [payment]" to finish</Text>
        <Text style={styles.tipText}>• Hindi commands also supported</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    backgroundColor: '#fff',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  title: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#333',
  },
  subtitle: {
    fontSize: 14,
    color: '#666',
    marginTop: 4,
  },
  micButton: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#2196F3',
    alignSelf: 'center',
    marginTop: 30,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
  micButtonActive: {
    backgroundColor: '#f44336',
  },
  micIcon: {
    fontSize: 40,
  },
  micHint: {
    textAlign: 'center',
    marginTop: 12,
    fontSize: 16,
    color: '#666',
  },
  commandCard: {
    backgroundColor: '#fff',
    margin: 16,
    padding: 16,
    borderRadius: 12,
    borderLeftWidth: 4,
    borderLeftColor: '#2196F3',
  },
  commandLabel: {
    fontSize: 12,
    color: '#999',
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  commandText: {
    fontSize: 18,
    color: '#333',
    marginTop: 4,
    fontStyle: 'italic',
  },
  responseCard: {
    backgroundColor: '#e8f5e9',
    marginHorizontal: 16,
    padding: 16,
    borderRadius: 12,
    borderLeftWidth: 4,
    borderLeftColor: '#4CAF50',
  },
  responseLabel: {
    fontSize: 12,
    color: '#666',
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  responseText: {
    fontSize: 16,
    color: '#333',
    marginTop: 4,
  },
  helpSection: {
    backgroundColor: '#fff',
    margin: 16,
    padding: 16,
    borderRadius: 12,
  },
  helpTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 12,
  },
  commandHelpItem: {
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  commandHelpText: {
    fontSize: 15,
    fontWeight: '500',
    color: '#2196F3',
  },
  commandHelpDesc: {
    fontSize: 13,
    color: '#666',
    marginTop: 2,
  },
  tipsSection: {
    backgroundColor: '#fff',
    margin: 16,
    marginTop: 0,
    padding: 16,
    borderRadius: 12,
    marginBottom: 30,
  },
  tipsTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 8,
  },
  tipText: {
    fontSize: 14,
    color: '#666',
    lineHeight: 22,
  },
});
