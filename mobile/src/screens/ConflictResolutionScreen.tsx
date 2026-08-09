// Conflict Resolution Screen for shopkeepers to inspect and resolve sync conflicts
import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { getStoredConflicts, resolveConflict } from '../modules/sync/engine';

interface ConflictRecord {
  queueItemId: number;
  conflictData: {
    server?: any;
    local?: any;
    conflictFields?: string[];
    reason?: string;
    details?: string;
  };
  createdAt: string;
}

export function ConflictResolutionScreen() {
  const [conflicts, setConflicts] = useState<ConflictRecord[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [resolvingId, setResolvingId] = useState<number | null>(null);

  const loadConflicts = async () => {
    setLoading(true);
    try {
      const stored = await getStoredConflicts();
      setConflicts(stored);
    } catch (err) {
      console.error('Failed to load conflicts', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadConflicts();
  }, []);

  const handleResolve = async (
    queueItemId: number,
    resolution: 'server_wins' | 'local_wins' | 'merge'
  ) => {
    setResolvingId(queueItemId);
    try {
      await resolveConflict(queueItemId, resolution);
      Alert.alert('Resolved', `Conflict item ${queueItemId} resolved successfully.`);
      await loadConflicts();
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to resolve conflict');
    } finally {
      setResolvingId(null);
    }
  };

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#2196F3" />
        <Text style={styles.loadingText}>Loading sync conflicts...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Sync Conflicts ({conflicts.length})</Text>
        <TouchableOpacity style={styles.refreshButton} onPress={loadConflicts}>
          <Text style={styles.refreshButtonText}>🔄 Refresh</Text>
        </TouchableOpacity>
      </View>

      {conflicts.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>🎉 No pending sync conflicts!</Text>
          <Text style={styles.emptySubtext}>
            All offline transactions and updates are synchronized smoothly.
          </Text>
        </View>
      ) : (
        <ScrollView style={styles.scrollContainer} contentContainerStyle={styles.scrollContent}>
          {conflicts.map((item) => {
            const server = item.conflictData?.server || {};
            const local = item.conflictData?.local || {};
            const fields = item.conflictData?.conflictFields || [];
            const isProcessing = resolvingId === item.queueItemId;

            return (
              <View key={item.queueItemId} style={styles.card}>
                <View style={styles.cardHeader}>
                  <Text style={styles.cardTitle}>Conflict # {item.queueItemId}</Text>
                  <Text style={styles.cardBadge}>Action Required</Text>
                </View>

                {item.conflictData?.reason && (
                  <View style={styles.reasonBox}>
                    <Text style={styles.reasonTitle}>Reason: {item.conflictData.reason}</Text>
                    {item.conflictData.details && (
                      <Text style={styles.reasonDetails}>{item.conflictData.details}</Text>
                    )}
                  </View>
                )}

                {fields.length > 0 && (
                  <View style={styles.fieldsContainer}>
                    <Text style={styles.sectionHeading}>Conflicting Fields:</Text>
                    {fields.map((f) => (
                      <Text key={f} style={styles.fieldTag}>
                        • {f}
                      </Text>
                    ))}
                  </View>
                )}

                <View style={styles.diffGrid}>
                  <View style={styles.diffCol}>
                    <Text style={[styles.colHeading, { color: '#E53935' }]}>📱 Local Version</Text>
                    <Text style={styles.jsonText}>{JSON.stringify(local, null, 2)}</Text>
                  </View>
                  <View style={styles.diffCol}>
                    <Text style={[styles.colHeading, { color: '#43A047' }]}>☁️ Server Version</Text>
                    <Text style={styles.jsonText}>{JSON.stringify(server, null, 2)}</Text>
                  </View>
                </View>

                <View style={styles.actionRow}>
                  <TouchableOpacity
                    style={[styles.actionBtn, styles.btnServer]}
                    disabled={isProcessing}
                    onPress={() => handleResolve(item.queueItemId, 'server_wins')}
                  >
                    <Text style={styles.btnText}>Use Server Version</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.actionBtn, styles.btnLocal]}
                    disabled={isProcessing}
                    onPress={() => handleResolve(item.queueItemId, 'local_wins')}
                  >
                    <Text style={styles.btnText}>Keep Local Version</Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F4F6F8',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#555',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: '#FFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#111',
  },
  refreshButton: {
    backgroundColor: '#E3F2FD',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  refreshButtonText: {
    color: '#1E88E5',
    fontWeight: '600',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  emptyText: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#2E7D32',
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
  },
  scrollContainer: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
  },
  card: {
    backgroundColor: '#FFF',
    borderRadius: 10,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
  },
  cardBadge: {
    backgroundColor: '#FFEBEE',
    color: '#C62828',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    fontSize: 12,
    fontWeight: '600',
  },
  reasonBox: {
    backgroundColor: '#FFF3E0',
    padding: 10,
    borderRadius: 6,
    marginBottom: 10,
  },
  reasonTitle: {
    fontWeight: 'bold',
    color: '#E65100',
    fontSize: 14,
  },
  reasonDetails: {
    fontSize: 13,
    color: '#BF360C',
    marginTop: 2,
  },
  fieldsContainer: {
    marginBottom: 12,
  },
  sectionHeading: {
    fontSize: 14,
    fontWeight: '600',
    color: '#444',
    marginBottom: 4,
  },
  fieldTag: {
    fontSize: 13,
    color: '#D84315',
    marginLeft: 8,
  },
  diffGrid: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 16,
  },
  diffCol: {
    flex: 1,
    backgroundColor: '#FAFAFA',
    padding: 10,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#EEEEEE',
  },
  colHeading: {
    fontWeight: 'bold',
    fontSize: 13,
    marginBottom: 6,
  },
  jsonText: {
    fontFamily: 'monospace',
    fontSize: 11,
    color: '#333',
  },
  actionRow: {
    flexDirection: 'row',
    gap: 10,
  },
  actionBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 6,
    alignItems: 'center',
  },
  btnServer: {
    backgroundColor: '#2E7D32',
  },
  btnLocal: {
    backgroundColor: '#1565C0',
  },
  btnText: {
    color: '#FFF',
    fontWeight: 'bold',
    fontSize: 13,
  },
});
