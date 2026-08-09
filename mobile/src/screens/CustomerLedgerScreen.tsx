// Customer credit ledger screen
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
} from 'react-native';
import { useCustomerStore } from '../../modules/customers/store';

export function CustomerLedgerScreen() {
  const {
    customers,
    selectedCustomer,
    outstanding,
    isLoading,
    error,
    fetchCustomers,
    fetchCustomerLedger,
    fetchOutstanding,
    recordPayment,
    clearSelection,
  } = useCustomerStore();

  const [searchQuery, setSearchQuery] = useState('');
  const [paymentModalVisible, setPaymentModalVisible] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentNotes, setPaymentNotes] = useState('');

  useEffect(() => {
    fetchCustomers();
    fetchOutstanding();
  }, []);

  const handleSearch = () => {
    fetchCustomers(searchQuery);
  };

  const handleSelectCustomer = (customer: any) => {
    fetchCustomerLedger(customer.id);
  };

  const handleRecordPayment = async () => {
    if (!selectedCustomer || !paymentAmount) return;

    const amount = parseFloat(paymentAmount);
    if (isNaN(amount) || amount <= 0) {
      Alert.alert('Error', 'Enter a valid amount');
      return;
    }

    const success = await recordPayment(selectedCustomer.id, amount, paymentNotes);
    if (success) {
      setPaymentModalVisible(false);
      setPaymentAmount('');
      setPaymentNotes('');
      Alert.alert('Success', 'Payment recorded successfully');
    }
  };

  const formatCurrency = (amount: number) => `₹${amount.toFixed(2)}`;

  const renderCustomer = ({ item }: { item: any }) => (
    <TouchableOpacity
      style={styles.customerCard}
      onPress={() => handleSelectCustomer(item)}
    >
      <View style={styles.customerInfo}>
        <Text style={styles.customerName}>{item.name}</Text>
        {item.phone && <Text style={styles.customerPhone}>{item.phone}</Text>}
      </View>
      <View style={styles.balanceContainer}>
        <Text style={[styles.balance, item.balance > 0 && styles.balanceOutstanding]}>
          {formatCurrency(item.balance)}
        </Text>
        <Text style={styles.balanceLabel}>Outstanding</Text>
      </View>
    </TouchableOpacity>
  );

  const renderLedgerEntry = ({ item }: { item: any }) => (
    <View style={styles.ledgerRow}>
      <View style={styles.ledgerDate}>
        <Text style={styles.ledgerDateText}>
          {new Date(item.createdAt).toLocaleDateString()}
        </Text>
        <Text style={styles.ledgerNotes}>{item.notes || '-'}</Text>
      </View>
      <View style={styles.ledgerAmounts}>
        {item.type === 'DEBIT' ? (
          <Text style={styles.debitAmount}>+{formatCurrency(item.amount)}</Text>
        ) : (
          <Text style={styles.creditAmount}>-{formatCurrency(item.amount)}</Text>
        )}
        <Text style={styles.runningBalance}>{formatCurrency(item.balance)}</Text>
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      {/* Outstanding Summary */}
      {outstanding && (
        <View style={styles.summaryCard}>
          <Text style={styles.summaryLabel}>Total Outstanding</Text>
          <Text style={styles.summaryAmount}>{formatCurrency(outstanding.totalOutstanding)}</Text>
          <Text style={styles.summarySubtext}>{outstanding.customerCount} customers</Text>
        </View>
      )}

      {/* Search */}
      <View style={styles.searchSection}>
        <TextInput
          style={styles.searchInput}
          placeholder="Search customers..."
          value={searchQuery}
          onChangeText={setSearchQuery}
          onSubmitEditing={handleSearch}
        />
        <TouchableOpacity style={styles.searchButton} onPress={handleSearch}>
          <Text style={styles.searchButtonText}>🔍</Text>
        </TouchableOpacity>
      </View>

      {error && (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      {/* Customer List */}
      <FlatList
        data={customers}
        renderItem={renderCustomer}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContainer}
        ListEmptyComponent={
          <Text style={styles.emptyText}>No customers found</Text>
        }
      />

      {/* Customer Ledger Modal */}
      <Modal visible={!!selectedCustomer} animationType="slide">
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={clearSelection}>
              <Text style={styles.backButton}>← Back</Text>
            </TouchableOpacity>
            <Text style={styles.modalTitle}>{selectedCustomer?.name}</Text>
            <TouchableOpacity
              style={styles.payButton}
              onPress={() => setPaymentModalVisible(true)}
            >
              <Text style={styles.payButtonText}>+ Record Payment</Text>
            </TouchableOpacity>
          </View>

          {selectedCustomer && (
            <>
              <View style={styles.ledgerSummary}>
                <View style={styles.ledgerSummaryItem}>
                  <Text style={styles.ledgerSummaryLabel}>Outstanding</Text>
                  <Text style={styles.ledgerSummaryValue}>
                    {formatCurrency(selectedCustomer.balance)}
                  </Text>
                </View>
                <View style={styles.ledgerSummaryItem}>
                  <Text style={styles.ledgerSummaryLabel}>Credit Limit</Text>
                  <Text style={styles.ledgerSummaryValue}>
                    {formatCurrency(selectedCustomer.creditLimit)}
                  </Text>
                </View>
              </View>

              <Text style={styles.sectionTitle}>Transaction History</Text>
              <FlatList
                data={selectedCustomer.creditLedger}
                renderItem={renderLedgerEntry}
                keyExtractor={(item) => item.id}
                contentContainerStyle={styles.ledgerList}
              />
            </>
          )}
        </View>
      </Modal>

      {/* Payment Modal */}
      <Modal visible={paymentModalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.paymentModal}>
            <Text style={styles.paymentTitle}>Record Payment</Text>
            <Text style={styles.paymentSubtitle}>
              {selectedCustomer?.name} - Outstanding: {selectedCustomer ? formatCurrency(selectedCustomer.balance) : ''}
            </Text>

            <TextInput
              style={styles.paymentInput}
              placeholder="Amount"
              value={paymentAmount}
              onChangeText={setPaymentAmount}
              keyboardType="decimal-pad"
            />
            <TextInput
              style={styles.paymentInput}
              placeholder="Notes (optional)"
              value={paymentNotes}
              onChangeText={setPaymentNotes}
            />

            <View style={styles.paymentActions}>
              <TouchableOpacity
                style={[styles.paymentBtn, styles.cancelBtn]}
                onPress={() => setPaymentModalVisible(false)}
              >
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.paymentBtn, styles.saveBtn]}
                onPress={handleRecordPayment}
              >
                <Text style={styles.saveBtnText}>Save</Text>
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
  summaryCard: {
    backgroundColor: '#fff',
    margin: 12,
    padding: 16,
    borderRadius: 12,
    elevation: 2,
    alignItems: 'center',
  },
  summaryLabel: {
    fontSize: 14,
    color: '#666',
  },
  summaryAmount: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#f44336',
    marginTop: 4,
  },
  summarySubtext: {
    fontSize: 12,
    color: '#999',
    marginTop: 4,
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
  customerCard: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 14,
    marginBottom: 8,
    elevation: 1,
  },
  customerInfo: {
    flex: 1,
  },
  customerName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  customerPhone: {
    fontSize: 13,
    color: '#666',
    marginTop: 2,
  },
  balanceContainer: {
    alignItems: 'flex-end',
  },
  balance: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  balanceOutstanding: {
    color: '#f44336',
  },
  balanceLabel: {
    fontSize: 11,
    color: '#999',
    marginTop: 2,
  },
  emptyText: {
    textAlign: 'center',
    color: '#999',
    fontSize: 16,
    marginTop: 40,
  },
  modalContainer: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  backButton: {
    fontSize: 16,
    color: '#2196F3',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  payButton: {
    backgroundColor: '#4CAF50',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  payButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '500',
  },
  ledgerSummary: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    margin: 12,
    borderRadius: 12,
    padding: 16,
    elevation: 1,
  },
  ledgerSummaryItem: {
    flex: 1,
    alignItems: 'center',
  },
  ledgerSummaryLabel: {
    fontSize: 12,
    color: '#666',
  },
  ledgerSummaryValue: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    marginTop: 4,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
    marginHorizontal: 16,
    marginBottom: 8,
  },
  ledgerList: {
    paddingHorizontal: 12,
  },
  ledgerRow: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    padding: 12,
    marginBottom: 4,
    borderRadius: 8,
  },
  ledgerDate: {
    flex: 1,
  },
  ledgerDateText: {
    fontSize: 14,
    color: '#333',
  },
  ledgerNotes: {
    fontSize: 12,
    color: '#999',
    marginTop: 2,
  },
  ledgerAmounts: {
    alignItems: 'flex-end',
  },
  debitAmount: {
    fontSize: 14,
    fontWeight: '600',
    color: '#f44336',
  },
  creditAmount: {
    fontSize: 14,
    fontWeight: '600',
    color: '#4CAF50',
  },
  runningBalance: {
    fontSize: 12,
    color: '#999',
    marginTop: 2,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    padding: 20,
  },
  paymentModal: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
  },
  paymentTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  paymentSubtitle: {
    fontSize: 14,
    color: '#666',
    marginTop: 4,
    marginBottom: 16,
  },
  paymentInput: {
    height: 44,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    paddingHorizontal: 12,
    marginBottom: 12,
  },
  paymentActions: {
    flexDirection: 'row',
    marginTop: 8,
  },
  paymentBtn: {
    flex: 1,
    height: 44,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cancelBtn: {
    backgroundColor: '#f0f0f0',
    marginRight: 8,
  },
  saveBtn: {
    backgroundColor: '#4CAF50',
    marginLeft: 8,
  },
  cancelBtnText: {
    fontSize: 16,
    color: '#666',
  },
  saveBtnText: {
    fontSize: 16,
    color: '#fff',
    fontWeight: '600',
  },
});
