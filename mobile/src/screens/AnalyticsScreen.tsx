// Analytics screen - Sales dashboard with KPIs and charts
import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Dimensions,
} from 'react-native';
import { useAnalyticsStore } from '../../modules/analytics/store';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CHART_WIDTH = SCREEN_WIDTH - 32;

type DateRange = 'today' | '7days' | '30days' | '90days';

export function AnalyticsScreen() {
  const [selectedRange, setSelectedRange] = useState<DateRange>('7days');
  const { dashboard, growth, isLoading, error, fetchDashboard } = useAnalyticsStore();

  useEffect(() => {
    fetchDashboard(selectedRange);
  }, [selectedRange, fetchDashboard]);

  const onRefresh = useCallback(() => {
    fetchDashboard(selectedRange);
  }, [selectedRange, fetchDashboard]);

  const formatCurrency = (amount: number) => {
    return `₹${amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const formatPercent = (value: number) => {
    const sign = value >= 0 ? '+' : '';
    return `${sign}${value.toFixed(1)}%`;
  };

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={isLoading} onRefresh={onRefresh} />}
    >
      {/* Date Range Selector */}
      <View style={styles.rangeSelector}>
        {(['today', '7days', '30days', '90days'] as DateRange[]).map((range) => (
          <TouchableOpacity
            key={range}
            style={[styles.rangeButton, selectedRange === range && styles.rangeButtonActive]}
            onPress={() => setSelectedRange(range)}
          >
            <Text style={[styles.rangeText, selectedRange === range && styles.rangeTextActive]}>
              {range === 'today' ? 'Today' : range === '7days' ? '7 Days' : range === '30days' ? '30 Days' : '90 Days'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Error Display */}
      {error && (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      {dashboard && (
        <>
          {/* KPI Cards */}
          <View style={styles.kpiGrid}>
            <View style={styles.kpiCard}>
              <Text style={styles.kpiLabel}>Total Revenue</Text>
              <Text style={styles.kpiValue}>{formatCurrency(dashboard.summary.totalRevenue)}</Text>
              {growth && (
                <Text style={[styles.kpiGrowth, growth.revenueGrowth >= 0 ? styles.growthPositive : styles.growthNegative]}>
                  {formatPercent(growth.revenueGrowth)} vs prev
                </Text>
              )}
            </View>

            <View style={styles.kpiCard}>
              <Text style={styles.kpiLabel}>Invoices</Text>
              <Text style={styles.kpiValue}>{dashboard.summary.invoiceCount}</Text>
              {growth && (
                <Text style={[styles.kpiGrowth, growth.invoiceGrowth >= 0 ? styles.growthPositive : styles.growthNegative]}>
                  {formatPercent(growth.invoiceGrowth)} vs prev
                </Text>
              )}
            </View>

            <View style={styles.kpiCard}>
              <Text style={styles.kpiLabel}>Avg Order Value</Text>
              <Text style={styles.kpiValue}>{formatCurrency(dashboard.summary.averageOrderValue)}</Text>
              {growth && (
                <Text style={[styles.kpiGrowth, growth.averageOrderGrowth >= 0 ? styles.growthPositive : styles.growthNegative]}>
                  {formatPercent(growth.averageOrderGrowth)} vs prev
                </Text>
              )}
            </View>

            <View style={styles.kpiCard}>
              <Text style={styles.kpiLabel}>Total Tax</Text>
              <Text style={styles.kpiValue}>{formatCurrency(dashboard.summary.totalTax)}</Text>
              <Text style={styles.kpiSubtext}>GST collected</Text>
            </View>
          </View>

          {/* Payment Breakdown */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Payment Methods</Text>
            <View style={styles.paymentGrid}>
              <View style={styles.paymentItem}>
                <View style={[styles.paymentDot, { backgroundColor: '#4CAF50' }]} />
                <Text style={styles.paymentLabel}>Cash</Text>
                <Text style={styles.paymentValue}>{formatCurrency(dashboard.summary.cashSales)}</Text>
              </View>
              <View style={styles.paymentItem}>
                <View style={[styles.paymentDot, { backgroundColor: '#2196F3' }]} />
                <Text style={styles.paymentLabel}>UPI</Text>
                <Text style={styles.paymentValue}>{formatCurrency(dashboard.summary.upiSales)}</Text>
              </View>
              <View style={styles.paymentItem}>
                <View style={[styles.paymentDot, { backgroundColor: '#FF9800' }]} />
                <Text style={styles.paymentLabel}>Card</Text>
                <Text style={styles.paymentValue}>{formatCurrency(dashboard.summary.cardSales)}</Text>
              </View>
              <View style={styles.paymentItem}>
                <View style={[styles.paymentDot, { backgroundColor: '#9C27B0' }]} />
                <Text style={styles.paymentLabel}>Credit</Text>
                <Text style={styles.paymentValue}>{formatCurrency(dashboard.summary.creditSales)}</Text>
              </View>
            </View>
          </View>

          {/* Daily Sales Chart (Simple Bar Chart) */}
          {dashboard.dailySales.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Daily Sales Trend</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={styles.chartContainer}>
                  {dashboard.dailySales.map((day, index) => {
                    const maxRevenue = Math.max(...dashboard.dailySales.map((d) => d.revenue));
                    const barHeight = maxRevenue > 0 ? (day.revenue / maxRevenue) * 120 : 0;
                    return (
                      <View key={index} style={styles.barColumn}>
                        <Text style={styles.barValue}>{day.revenue > 0 ? `₹${(day.revenue / 1000).toFixed(1)}k` : ''}</Text>
                        <View style={[styles.bar, { height: Math.max(barHeight, 2) }]} />
                        <Text style={styles.barLabel}>{day.date.split('-')[2]}</Text>
                      </View>
                    );
                  })}
                </View>
              </ScrollView>
            </View>
          )}

          {/* Top Products */}
          {dashboard.topProducts.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Top Products</Text>
              {dashboard.topProducts.slice(0, 5).map((product, index) => (
                <View key={product.productId} style={styles.productRow}>
                  <View style={styles.productRank}>
                    <Text style={styles.productRankText}>{index + 1}</Text>
                  </View>
                  <View style={styles.productInfo}>
                    <Text style={styles.productName}>{product.productName}</Text>
                    <Text style={styles.productMeta}>Qty: {product.totalQuantity}</Text>
                  </View>
                  <Text style={styles.productRevenue}>{formatCurrency(product.totalRevenue)}</Text>
                </View>
              ))}
            </View>
          )}

          {/* Category Breakdown */}
          {dashboard.categorySales.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Sales by Category</Text>
              {dashboard.categorySales.map((cat, index) => (
                <View key={index} style={styles.categoryRow}>
                  <View style={styles.categoryInfo}>
                    <Text style={styles.categoryName}>{cat.category}</Text>
                    <View style={styles.categoryBar}>
                      <View
                        style={[
                          styles.categoryBarFill,
                          { width: `${cat.percentageOfTotal}%` },
                        ]}
                      />
                    </View>
                  </View>
                  <View style={styles.categoryStats}>
                    <Text style={styles.categoryRevenue}>{formatCurrency(cat.totalRevenue)}</Text>
                    <Text style={styles.categoryPercent}>{cat.percentageOfTotal}%</Text>
                  </View>
                </View>
              ))}
            </View>
          )}

          {/* Alerts */}
          {(dashboard.lowStockCount > 0 || dashboard.expiringCount > 0) && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Alerts</Text>
              {dashboard.lowStockCount > 0 && (
                <View style={styles.alertRow}>
                  <Text style={styles.alertIcon}>⚠️</Text>
                  <Text style={styles.alertText}>
                    {dashboard.lowStockCount} product{dashboard.lowStockCount > 1 ? 's' : ''} low in stock
                  </Text>
                </View>
              )}
              {dashboard.expiringCount > 0 && (
                <View style={styles.alertRow}>
                  <Text style={styles.alertIcon}>⏰</Text>
                  <Text style={styles.alertText}>
                    {dashboard.expiringCount} batch{dashboard.expiringCount > 1 ? 'es' : ''} expiring in 30 days
                  </Text>
                </View>
              )}
            </View>
          )}
        </>
      )}

      {isLoading && !dashboard && (
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>Loading analytics...</Text>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  rangeSelector: {
    flexDirection: 'row',
    padding: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  rangeButton: {
    flex: 1,
    paddingVertical: 8,
    marginHorizontal: 4,
    borderRadius: 8,
    backgroundColor: '#f0f0f0',
    alignItems: 'center',
  },
  rangeButtonActive: {
    backgroundColor: '#2196F3',
  },
  rangeText: {
    fontSize: 14,
    color: '#666',
    fontWeight: '500',
  },
  rangeTextActive: {
    color: '#fff',
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
  kpiGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: 8,
  },
  kpiCard: {
    width: '48%',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    margin: '1%',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  kpiLabel: {
    fontSize: 12,
    color: '#666',
    marginBottom: 4,
  },
  kpiValue: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
  },
  kpiGrowth: {
    fontSize: 12,
    marginTop: 4,
    fontWeight: '500',
  },
  growthPositive: {
    color: '#4CAF50',
  },
  growthNegative: {
    color: '#f44336',
  },
  kpiSubtext: {
    fontSize: 12,
    color: '#999',
    marginTop: 4,
  },
  section: {
    backgroundColor: '#fff',
    margin: 12,
    marginTop: 4,
    borderRadius: 12,
    padding: 16,
    elevation: 1,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 12,
  },
  paymentGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  paymentItem: {
    width: '50%',
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
  },
  paymentDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 8,
  },
  paymentLabel: {
    flex: 1,
    fontSize: 14,
    color: '#666',
  },
  paymentValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
  },
  chartContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    height: 160,
    paddingTop: 20,
  },
  barColumn: {
    width: 40,
    marginHorizontal: 4,
    alignItems: 'center',
  },
  bar: {
    width: 24,
    backgroundColor: '#2196F3',
    borderRadius: 4,
    minHeight: 2,
  },
  barValue: {
    fontSize: 10,
    color: '#666',
    marginBottom: 4,
  },
  barLabel: {
    fontSize: 11,
    color: '#999',
    marginTop: 4,
  },
  productRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  productRank: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#e3f2fd',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  productRankText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#1976d2',
  },
  productInfo: {
    flex: 1,
  },
  productName: {
    fontSize: 14,
    fontWeight: '500',
    color: '#333',
  },
  productMeta: {
    fontSize: 12,
    color: '#999',
    marginTop: 2,
  },
  productRevenue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
  },
  categoryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
  },
  categoryInfo: {
    flex: 1,
  },
  categoryName: {
    fontSize: 14,
    fontWeight: '500',
    color: '#333',
    marginBottom: 4,
  },
  categoryBar: {
    height: 8,
    backgroundColor: '#e0e0e0',
    borderRadius: 4,
    overflow: 'hidden',
  },
  categoryBarFill: {
    height: '100%',
    backgroundColor: '#4CAF50',
    borderRadius: 4,
  },
  categoryStats: {
    alignItems: 'flex-end',
    marginLeft: 12,
  },
  categoryRevenue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
  },
  categoryPercent: {
    fontSize: 12,
    color: '#999',
  },
  alertRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
  },
  alertIcon: {
    fontSize: 20,
    marginRight: 8,
  },
  alertText: {
    fontSize: 14,
    color: '#666',
  },
  loadingContainer: {
    padding: 40,
    alignItems: 'center',
  },
  loadingText: {
    fontSize: 16,
    color: '#999',
  },
});
