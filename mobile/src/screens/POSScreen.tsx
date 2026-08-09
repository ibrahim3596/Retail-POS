// POS/Billing screen - Main billing interface
import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useBillingStore } from '../../modules/billing/store';
import { useBarcodeScanner } from '../../modules/barcode/scanner';
import { findProductByBarcode } from '../../modules/barcode/scanner';
import { ERROR_MESSAGES } from '../../config/app';

export function POSScreen() {
  const {
    cart,
    isProcessing,
    error,
    addToCart,
    removeFromCart,
    updateQuantity,
    clearCart,
    getSubtotal,
    getTotalDiscount,
    getGrandTotal,
    processSale,
  } = useBillingStore();

  const { lastScanned, resetScan, startScanning, stopScanning, isScanning } = useBarcodeScanner();
  const [manualBarcode, setManualBarcode] = useState('');

  // Handle barcode scan result
  React.useEffect(() => {
    if (lastScanned) {
      handleBarcodeResult(lastScanned);
      resetScan();
    }
  }, [lastScanned]);

  const handleBarcodeResult = async (barcode: string) => {
    const product = await findProductByBarcode(barcode);
    if (!product) {
      Alert.alert('Not Found', ERROR_MESSAGES.INVALID_BARCODE);
      return;
    }

    addToCart({
      productId: product.id,
      productName: product.name,
      barcode: product.barcode,
      quantity: 1,
      unitPrice: product.selling_price,
      mrp: product.mrp,
      discount: 0,
      gstRate: product.gst_rate,
      taxType: product.tax_type,
      availableStock: product.current_stock,
    });
  };

  const handleManualBarcodeSubmit = () => {
    if (manualBarcode.trim()) {
      handleBarcodeResult(manualBarcode.trim());
      setManualBarcode('');
    }
  };

  const handleCompleteSale = () => {
    if (cart.length === 0) {
      Alert.alert('Empty Cart', 'Add items to cart first');
      return;
    }

    Alert.alert(
      'Complete Sale',
      `Total: ₹${getGrandTotal().toFixed(2)}`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Cash',
          onPress: async () => {
            const result = await processSale('CASH');
            if (result.success) {
              Alert.alert('Success', `Sale completed!\nInvoice: ${result.invoiceNumber}`);
            }
          },
        },
        {
          text: 'UPI',
          onPress: async () => {
            const result = await processSale('UPI');
            if (result.success) {
              Alert.alert('Success', `Sale completed!\nInvoice: ${result.invoiceNumber}`);
            }
          },
        },
      ]
    );
  };

  const renderCartItem = ({ item }: { item: any }) => (
    <View style={styles.cartItem}>
      <View style={styles.cartItemInfo}>
        <Text style={styles.cartItemName}>{item.productName}</Text>
        <Text style={styles.cartItemPrice}>
          ₹{item.unitPrice.toFixed(2)} x {item.quantity}
        </Text>
      </View>
      <View style={styles.cartItemActions}>
        <TouchableOpacity
          style={styles.qtyButton}
          onPress={() => updateQuantity(item.productId, item.quantity - 1)}
        >
          <Text style={styles.qtyButtonText}>-</Text>
        </TouchableOpacity>
        <Text style={styles.qtyText}>{item.quantity}</Text>
        <TouchableOpacity
          style={styles.qtyButton}
          onPress={() => updateQuantity(item.productId, item.quantity + 1)}
        >
          <Text style={styles.qtyButtonText}>+</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.removeButton}
          onPress={() => removeFromCart(item.productId)}
        >
          <Text style={styles.removeButtonText}>✕</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      {/* Barcode Input */}
      <View style={styles.searchSection}>
        <TextInput
          style={styles.barcodeInput}
          placeholder="Scan or enter barcode"
          value={manualBarcode}
          onChangeText={setManualBarcode}
          onSubmitEditing={handleManualBarcodeSubmit}
          returnKeyType="search"
        />
        <TouchableOpacity style={styles.scanButton} onPress={startScanning}>
          <Text style={styles.scanButtonText}>📷</Text>
        </TouchableOpacity>
      </View>

      {/* Error Display */}
      {error && (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      {/* Cart Items */}
      <FlatList
        data={cart}
        renderItem={renderCartItem}
        keyExtractor={(item) => item.productId}
        style={styles.cartList}
        ListEmptyComponent={
          <Text style={styles.emptyText}>Cart is empty. Scan items to add.</Text>
        }
      />

      {/* Totals */}
      {cart.length > 0 && (
        <View style={styles.totalsSection}>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Subtotal:</Text>
            <Text style={styles.totalValue}>₹{getSubtotal().toFixed(2)}</Text>
          </View>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Discount:</Text>
            <Text style={styles.totalValue}>-₹{getTotalDiscount().toFixed(2)}</Text>
          </View>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>GST:</Text>
            <Text style={styles.totalValue}>₹{((getGrandTotal() - getSubtotal() + getTotalDiscount())).toFixed(2)}</Text>
          </View>
          <View style={[styles.totalRow, styles.grandTotalRow]}>
            <Text style={styles.grandTotalLabel}>Grand Total:</Text>
            <Text style={styles.grandTotalValue}>₹{getGrandTotal().toFixed(2)}</Text>
          </View>
        </View>
      )}

      {/* Action Buttons */}
      <View style={styles.actionSection}>
        <TouchableOpacity
          style={[styles.actionButton, styles.clearButton]}
          onPress={clearCart}
          disabled={cart.length === 0}
        >
          <Text style={styles.actionButtonText}>Clear</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.actionButton, styles.saleButton]}
          onPress={handleCompleteSale}
          disabled={cart.length === 0 || isProcessing}
        >
          {isProcessing ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.actionButtonText}>Complete Sale</Text>
          )}
        </TouchableOpacity>
      </View>
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
  barcodeInput: {
    flex: 1,
    height: 44,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    paddingHorizontal: 12,
    fontSize: 16,
  },
  scanButton: {
    width: 44,
    height: 44,
    marginLeft: 8,
    backgroundColor: '#2196F3',
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scanButtonText: {
    fontSize: 20,
  },
  errorBanner: {
    backgroundColor: '#ffebee',
    padding: 10,
    marginHorizontal: 12,
    marginTop: 8,
    borderRadius: 6,
    borderLeftWidth: 4,
    borderLeftColor: '#f44336',
  },
  errorText: {
    color: '#c62828',
    fontSize: 14,
  },
  cartList: {
    flex: 1,
    paddingHorizontal: 12,
  },
  cartItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#fff',
    padding: 12,
    marginVertical: 4,
    borderRadius: 8,
    elevation: 1,
  },
  cartItemInfo: {
    flex: 1,
  },
  cartItemName: {
    fontSize: 16,
    fontWeight: '500',
    color: '#333',
  },
  cartItemPrice: {
    fontSize: 14,
    color: '#666',
    marginTop: 2,
  },
  cartItemActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  qtyButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#e3f2fd',
    justifyContent: 'center',
    alignItems: 'center',
  },
  qtyButtonText: {
    fontSize: 18,
    color: '#1976d2',
    fontWeight: 'bold',
  },
  qtyText: {
    fontSize: 16,
    fontWeight: '500',
    marginHorizontal: 12,
    minWidth: 24,
    textAlign: 'center',
  },
  removeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#ffebee',
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
  },
  removeButtonText: {
    fontSize: 16,
    color: '#c62828',
    fontWeight: 'bold',
  },
  emptyText: {
    textAlign: 'center',
    color: '#999',
    fontSize: 16,
    marginTop: 40,
  },
  totalsSection: {
    backgroundColor: '#fff',
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  totalLabel: {
    fontSize: 14,
    color: '#666',
  },
  totalValue: {
    fontSize: 14,
    color: '#333',
  },
  grandTotalRow: {
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
    paddingTop: 8,
    marginTop: 4,
  },
  grandTotalLabel: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  grandTotalValue: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#2e7d32',
  },
  actionSection: {
    flexDirection: 'row',
    padding: 12,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
  },
  actionButton: {
    flex: 1,
    height: 48,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  clearButton: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#f44336',
    marginRight: 8,
  },
  saleButton: {
    backgroundColor: '#4caf50',
    marginLeft: 8,
  },
  actionButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
});
