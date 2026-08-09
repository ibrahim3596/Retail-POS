// Analytics state management
import { create } from 'zustand';
import apiClient from '../../shared/api/client';

interface SalesSummary {
  totalRevenue: number;
  totalTax: number;
  totalDiscount: number;
  invoiceCount: number;
  averageOrderValue: number;
  cashSales: number;
  upiSales: number;
  cardSales: number;
  creditSales: number;
}

interface DailySales {
  date: string;
  revenue: number;
  invoiceCount: number;
  taxAmount: number;
}

interface TopProduct {
  productId: string;
  productName: string;
  totalQuantity: number;
  totalRevenue: number;
  totalProfit: number;
}

interface CategorySales {
  category: string;
  totalRevenue: number;
  totalQuantity: number;
  percentageOfTotal: number;
}

interface AnalyticsDashboard {
  summary: SalesSummary;
  dailySales: DailySales[];
  topProducts: TopProduct[];
  categorySales: CategorySales[];
  hourlyDistribution: any[];
  lowStockCount: number;
  expiringCount: number;
}

interface GrowthMetrics {
  revenueGrowth: number;
  invoiceGrowth: number;
  averageOrderGrowth: number;
}

interface AnalyticsState {
  dashboard: AnalyticsDashboard | null;
  growth: GrowthMetrics | null;
  isLoading: boolean;
  error: string | null;
  fetchDashboard: (range: 'today' | '7days' | '30days' | '90days') => Promise<void>;
}

function getDateRange(range: 'today' | '7days' | '30days' | '90days'): { startDate: string; endDate: string } {
  const end = new Date();
  const start = new Date();

  switch (range) {
    case 'today':
      start.setHours(0, 0, 0, 0);
      break;
    case '7days':
      start.setDate(start.getDate() - 7);
      break;
    case '30days':
      start.setDate(start.getDate() - 30);
      break;
    case '90days':
      start.setDate(start.getDate() - 90);
      break;
  }

  return {
    startDate: start.toISOString(),
    endDate: end.toISOString(),
  };
}

export const useAnalyticsStore = create<AnalyticsState>((set) => ({
  dashboard: null,
  growth: null,
  isLoading: false,
  error: null,

  fetchDashboard: async (range: 'today' | '7days' | '30days' | '90days') => {
    set({ isLoading: true, error: null });

    try {
      const { startDate, endDate } = getDateRange(range);

      const [dashboardResponse, growthResponse] = await Promise.all([
        apiClient.get('/analytics/dashboard', {
          params: { startDate, endDate },
        }),
        apiClient.get('/analytics/growth', {
          params: { startDate, endDate },
        }),
      ]);

      set({
        dashboard: dashboardResponse.data.data,
        growth: growthResponse.data.data,
        isLoading: false,
      });
    } catch (error: any) {
      // If offline, try to compute from local DB
      if (!error.response && error.message === 'Network Error') {
        set({ error: 'No internet connection. Showing cached data.', isLoading: false });
      } else {
        const message = error.response?.data?.error?.message || 'Failed to load analytics';
        set({ error: message, isLoading: false });
      }
    }
  },
}));
