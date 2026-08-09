// Navigation structure
import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Text } from 'react-native';

// Screens
import { POSScreen } from '../screens/POSScreen';
import { AnalyticsScreen } from '../screens/AnalyticsScreen';
import { SupplierScreen } from '../screens/SupplierScreen';
import { CustomerLedgerScreen } from '../screens/CustomerLedgerScreen';
import { AIRecognitionScreen } from '../screens/AIRecognitionScreen';
import { VoiceBillingScreen } from '../screens/VoiceBillingScreen';

import { ConflictResolutionScreen } from '../screens/ConflictResolutionScreen';

// Placeholder screens for navigation
function SettingsScreen() { return <Text>Settings</Text>; }

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: true,
        tabBarActiveTintColor: '#2196F3',
      }}
    >
      <Tab.Screen
        name="POS"
        component={POSScreen}
        options={{
          title: 'Billing',
          tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 20 }}>💰</Text>,
        }}
      />
      <Tab.Screen
        name="Inventory"
        component={SupplierScreen}
        options={{
          title: 'Inventory',
          tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 20 }}>📦</Text>,
        }}
      />
      <Tab.Screen
        name="Analytics"
        component={AnalyticsScreen}
        options={{
          title: 'Analytics',
          tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 20 }}>📊</Text>,
        }}
      />
      <Tab.Screen
        name="Customers"
        component={CustomerLedgerScreen}
        options={{
          title: 'Customers',
          tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 20 }}>👥</Text>,
        }}
      />
      <Tab.Screen
        name="Conflicts"
        component={ConflictResolutionScreen}
        options={{
          title: 'Conflicts',
          tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 20 }}>⚠️</Text>,
        }}
      />
      <Tab.Screen
        name="AI"
        component={AIRecognitionScreen}
        options={{
          title: 'AI Tools',
          tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 20 }}>🤖</Text>,
        }}
      />
      <Tab.Screen
        name="Voice"
        component={VoiceBillingScreen}
        options={{
          title: 'Voice',
          tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 20 }}>🎤</Text>,
        }}
      />
    </Tab.Navigator>
  );
}

export function AppNavigator() {
  return (
    <NavigationContainer>
      <Stack.Navigator>
        <Stack.Screen
          name="Main"
          component={MainTabs}
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="ConflictResolution"
          component={ConflictResolutionScreen}
          options={{ title: 'Sync Conflict Resolution' }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
