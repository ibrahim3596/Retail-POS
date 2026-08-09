// Supplier management screen
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  TextInput,
  Alert,
  Modal,
  ActivityIndicator,
} from 'react-native';
import { useSupplierStore } from '../../modules/suppliers/store';

export function SupplierScreen() {
  const { suppliers, isLoading, error, fetchSuppliers, createSupplier, updateSupplier, deleteSupplier } = useSupplierStore();
  const [searchQuery, setSearchQuery] = useState('');
  const [modalVisible, setModalVisible] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<any>(null);
  const [formData, setFormData] = useState({ name: '', phone: '', email: '', gstin: '', address: '' });

  useEffect(() => {
    fetchSuppliers();
  }, []);

  const handleSearch = () => {
    fetchSuppliers(searchQuery);
  };

  const handleCreate = () => {
    setEditingSupplier(null);
    setFormData({ name: '', phone: '', email: '', gstin: '', address: '' });
    setModalVisible(true);
  };

  const handleEdit = (supplier: any) => {
    setEditingSupplier(supplier);
    setFormData({
      name: supplier.name || '',
      phone: supplier.phone || '',
      email: supplier.email || '',
      gstin: supplier.gstin || '',
      address: supplier.address || '',
    });
    setModalVisible(true);
  };

  const handleSave = async () => {
    if (!formData.name.trim()) {
      Alert.alert('Error', 'Supplier name is required');
      return;
    }

    let success: boolean;
    if (editingSupplier) {
      success = await updateSupplier(editingSupplier.id, formData);
    } else {
      success = await createSupplier(formData);
    }

    if (success) {
      setModalVisible(false);
    } else {
      Alert.alert('Error', 'Failed to save supplier');
    }
  };

  const handleDelete = (supplier: any) => {
    Alert.alert(
      'Delete Supplier',
      `Are you sure you want to delete "${supplier.name}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => deleteSupplier(supplier.id),
        },
      ]
    );
  };

  const renderSupplier = ({ item }: { item: any }) => (
    <View style={styles.supplierCard}>
      <View style={styles.supplierInfo}>
        <Text style={styles.supplierName}>{item.name}</Text>
        {item.phone && <Text style={styles.supplierDetail}>📞 {item.phone}</Text>}
        {item.gstin && <Text style={styles.supplierDetail}>🏢 GST: {item.gstin}</Text>}
        {item.email && <Text style={styles.supplierDetail}>✉️ {item.email}</Text>}
      </View>
      <View style={styles.supplierActions}>
        <TouchableOpacity style={styles.editButton} onPress={() => handleEdit(item)}>
          <Text style={styles.actionButtonText}>✏️</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.deleteButton} onPress={() => handleDelete(item)}>
          <Text style={styles.actionButtonText}>🗑️</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      {/* Search Bar */}
      <View style={styles.searchSection}>
        <TextInput
          style={styles.searchInput}
          placeholder="Search suppliers..."
          value={searchQuery}
          onChangeText={setSearchQuery}
          onSubmitEditing={handleSearch}
        />
        <TouchableOpacity style={styles.searchButton} onPress={handleSearch}>
          <Text style={styles.searchButtonText}>🔍</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.addButton} onPress={handleCreate}>
          <Text style={styles.addButtonText}>+</Text>
        </TouchableOpacity>
      </View>

      {error && (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      {/* Supplier List */}
      <FlatList
        data={suppliers}
        renderItem={renderSupplier}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContainer}
        ListEmptyComponent={
          isLoading ? (
            <ActivityIndicator size="large" color="#2196F3" />
          ) : (
            <Text style={styles.emptyText}>No suppliers found. Add your first supplier.</Text>
          )
        }
      />

      {/* Create/Edit Modal */}
      <Modal visible={modalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>
              {editingSupplier ? 'Edit Supplier' : 'Add Supplier'}
            </Text>

            <TextInput
              style={styles.input}
              placeholder="Supplier Name *"
              value={formData.name}
              onChangeText={(text) => setFormData({ ...formData, name: text })}
            />
            <TextInput
              style={styles.input}
              placeholder="Phone"
              value={formData.phone}
              onChangeText={(text) => setFormData({ ...formData, phone: text })}
              keyboardType="phone-pad"
            />
            <TextInput
              style={styles.input}
              placeholder="Email"
              value={formData.email}
              onChangeText={(text) => setFormData({ ...formData, email: text })}
              keyboardType="email-address"
            />
            <TextInput
              style={styles.input}
              placeholder="GSTIN (15 characters)"
              value={formData.gstin}
              onChangeText={(text) => setFormData({ ...formData, gstin: text })}
              maxLength={15}
            />
            <TextInput
              style={[styles.input, styles.textArea]}
              placeholder="Address"
              value={formData.address}
              onChangeText={(text) => setFormData({ ...formData, address: text })}
              multiline
              numberOfLines={3}
            />

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.modalButton, styles.cancelButton]}
                onPress={() => setModalVisible(false)}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.saveButton]}
                onPress={handleSave}
              >
                <Text style={styles.saveButtonText}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  searchSection: {
    flexDirection: 'row',
    padding: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  searchInput: {
    flex: 1,
    height: 40,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    paddingHorizontal: 12,
  },
  searchButton: {
    width: 40,
    height: 40,
    marginLeft: 8,
    backgroundColor: '#f0f0f0',
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  searchButtonText: {
    fontSize: 18,
  },
  addButton: {
    width: 40,
    height: 40,
    marginLeft: 8,
    backgroundColor: '#4CAF50',
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  addButtonText: {
    fontSize: 24,
    color: '#fff',
    fontWeight: 'bold',
  },
  errorBanner: {
    backgroundColor: '#ffebee',
    padding: 10,
    marginHorizontal: 12,
    marginTop: 8,
    borderRadius: 6,
  },
  errorText: {
    color: '#c62828',
    fontSize: 14,
  },
  listContainer: {
    padding: 12,
  },
  supplierCard: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 14,
    marginBottom: 8,
    elevation: 1,
  },
  supplierInfo: {
    flex: 1,
  },
  supplierName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  supplierDetail: {
    fontSize: 13,
    color: '#666',
    marginTop: 2,
  },
  supplierActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  editButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#e3f2fd',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
  },
  deleteButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#ffebee',
    justifyContent: 'center',
    alignItems: 'center',
  },
  actionButtonText: {
    fontSize: 16,
  },
  emptyText: {
    textAlign: 'center',
    color: '#999',
    fontSize: 16,
    marginTop: 40,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 16,
  },
  input: {
    height: 44,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    paddingHorizontal: 12,
    marginBottom: 12,
    fontSize: 15,
  },
  textArea: {
    height: 80,
    textAlignVertical: 'top',
    paddingTop: 10,
  },
  modalActions: {
    flexDirection: 'row',
    marginTop: 8,
  },
  modalButton: {
    flex: 1,
    height: 44,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cancelButton: {
    backgroundColor: '#f0f0f0',
    marginRight: 8,
  },
  saveButton: {
    backgroundColor: '#2196F3',
    marginLeft: 8,
  },
  cancelButtonText: {
    fontSize: 16,
    color: '#666',
    fontWeight: '500',
  },
  saveButtonText: {
    fontSize: 16,
    color: '#fff',
    fontWeight: '600',
  },
});
