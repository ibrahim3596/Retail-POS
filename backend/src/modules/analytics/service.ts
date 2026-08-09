// Analytics service - sales reports, trends, and business insights
import { prisma } from '@shared/database/prisma';
import { logger } from '@shared/utils/logger';

export interface DateRange {
  startDate: Date;
  endDate: Date;
}

export interface SalesSummary {
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

export interface DailySales {
  date: string;
  revenue: number;
  invoiceCount: number;
  taxAmount: number;
}

export interface TopProduct {
  productId: string;
  productName: string;
  totalQuantity: number;
  totalRevenue: number;
  totalProfit: number;
}

export interface CategorySales {
  category: string;
  totalRevenue: number;
  totalQuantity: number;
  percentageOfTotal: number;
}

export interface HourlyDistribution {
  hour: number;
  invoiceCount: number;
  revenue: number;
}

export interface AnalyticsDashboard {
  summary: SalesSummary;
  dailySales: DailySales[];
  topProducts: TopProduct[];
  categorySales: CategorySales[];
  hourlyDistribution: HourlyDistribution[];
  lowStockCount: number;
  expiringCount: number;
}

/**
 * Get sales summary for a date range
 */
export async function getSalesSummary(
  storeId: string,
  dateRange: DateRange
): Promise<SalesSummary> {
  const result = await prisma.invoice.aggregate({
    where: {
      storeId,
      status: 'COMPLETED',
      createdAt: {
        gte: dateRange.startDate,
        lte: dateRange.endDate,
      },
    },
    _sum: {
      grandTotal: true,
      totalTax: true,
      discountAmount: true,
    },
    _count: {
      id: true,
    },
  });

  // Get payment method breakdown
  const paymentBreakdown = await prisma.invoice.groupBy({
    by: ['paymentMethod'],
    where: {
      storeId,
      status: 'COMPLETED',
      createdAt: {
        gte: dateRange.startDate,
        lte: dateRange.endDate,
      },
    },
    _sum: {
      grandTotal: true,
    },
  });

  const invoiceCount = result._count.id || 0;
  const totalRevenue = Number(result._sum.grandTotal) || 0;

  return {
    totalRevenue,
    totalTax: Number(result._sum.totalTax) || 0,
    totalDiscount: Number(result._sum.discountAmount) || 0,
    invoiceCount,
    averageOrderValue: invoiceCount > 0 ? Math.round((totalRevenue / invoiceCount) * 100) / 100 : 0,
    cashSales: Number(paymentBreakdown.find((p) => p.paymentMethod === 'CASH')?._sum.grandTotal) || 0,
    upiSales: Number(paymentBreakdown.find((p) => p.paymentMethod === 'UPI')?._sum.grandTotal) || 0,
    cardSales: Number(paymentBreakdown.find((p) => p.paymentMethod === 'CARD')?._sum.grandTotal) || 0,
    creditSales: Number(paymentBreakdown.find((p) => p.paymentMethod === 'CREDIT')?._sum.grandTotal) || 0,
  };
}

/**
 * Get daily sales trend for charting
 */
export async function getDailySales(
  storeId: string,
  dateRange: DateRange
): Promise<DailySales[]> {
  const invoices = await prisma.invoice.findMany({
    where: {
      storeId,
      status: 'COMPLETED',
      createdAt: {
        gte: dateRange.startDate,
        lte: dateRange.endDate,
      },
    },
    select: {
      createdAt: true,
      grandTotal: true,
      totalTax: true,
    },
    orderBy: {
      createdAt: 'asc',
    },
  });

  // Group by date
  const dailyMap = new Map<string, { revenue: number; count: number; tax: number }>();

  for (const invoice of invoices) {
    const dateKey = invoice.createdAt.toISOString().split('T')[0];
    const existing = dailyMap.get(dateKey) || { revenue: 0, count: 0, tax: 0 };
    existing.revenue += Number(invoice.grandTotal);
    existing.count += 1;
    existing.tax += Number(invoice.totalTax);
    dailyMap.set(dateKey, existing);
  }

  return Array.from(dailyMap.entries())
    .map(([date, data]) => ({
      date,
      revenue: Math.round(data.revenue * 100) / 100,
      invoiceCount: data.count,
      taxAmount: Math.round(data.tax * 100) / 100,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Get top-selling products
 */
export async function getTopProducts(
  storeId: string,
  dateRange: DateRange,
  limit: number = 10
): Promise<TopProduct[]> {
  const items = await prisma.invoiceItem.findMany({
    where: {
      invoice: {
        storeId,
        status: 'COMPLETED',
        createdAt: {
          gte: dateRange.startDate,
          lte: dateRange.endDate,
        },
      },
    },
    select: {
      productId: true,
      productName: true,
      quantity: true,
      totalAmount: true,
      unitPrice: true,
    },
  });

  // Aggregate by product
  const productMap = new Map<string, TopProduct>();

  for (const item of items) {
    const existing = productMap.get(item.productId) || {
      productId: item.productId,
      productName: item.productName,
      totalQuantity: 0,
      totalRevenue: 0,
      totalProfit: 0,
    };

    existing.totalQuantity += Number(item.quantity);
    existing.totalRevenue += Number(item.totalAmount);
    productMap.set(item.productId, existing);
  }

  // Sort by revenue and return top N
  return Array.from(productMap.values())
    .sort((a, b) => b.totalRevenue - a.totalRevenue)
    .slice(0, limit)
    .map((p) => ({
      ...p,
      totalQuantity: Math.round(p.totalQuantity * 1000) / 1000,
      totalRevenue: Math.round(p.totalRevenue * 100) / 100,
      totalProfit: Math.round(p.totalProfit * 100) / 100,
    }));
}

/**
 * Get sales by category
 */
export async function getCategorySales(
  storeId: string,
  dateRange: DateRange
): Promise<CategorySales[]> {
  const products = await prisma.invoiceItem.findMany({
    where: {
      invoice: {
        storeId,
        status: 'COMPLETED',
        createdAt: {
          gte: dateRange.startDate,
          lte: dateRange.endDate,
        },
      },
    },
    select: {
      productId: true,
      quantity: true,
      totalAmount: true,
    },
  });

  // Get product categories
  const productIds = [...new Set(products.map((p) => p.productId))];
  const productCategories = await prisma.product.findMany({
    where: { id: { in: productIds } },
    select: { id: true, category: true },
  });

  const categoryMap = new Map(productCategories.map((p) => [p.id, p.category || 'Uncategorized']));

  // Aggregate by category
  const categorySalesMap = new Map<string, { revenue: number; quantity: number }>();

  for (const item of products) {
    const category = categoryMap.get(item.productId) || 'Uncategorized';
    const existing = categorySalesMap.get(category) || { revenue: 0, quantity: 0 };
    existing.revenue += Number(item.totalAmount);
    existing.quantity += Number(item.quantity);
    categorySalesMap.set(category, existing);
  }

  const totalRevenue = Array.from(categorySalesMap.values()).reduce((sum, c) => sum + c.revenue, 0);

  return Array.from(categorySalesMap.entries())
    .map(([category, data]) => ({
      category,
      totalRevenue: Math.round(data.revenue * 100) / 100,
      totalQuantity: Math.round(data.quantity * 1000) / 1000,
      percentageOfTotal: totalRevenue > 0 ? Math.round((data.revenue / totalRevenue) * 10000) / 100 : 0,
    }))
    .sort((a, b) => b.totalRevenue - a.totalRevenue);
}

/**
 * Get hourly sales distribution (for peak hours analysis)
 */
export async function getHourlyDistribution(
  storeId: string,
  dateRange: DateRange
): Promise<HourlyDistribution[]> {
  const invoices = await prisma.invoice.findMany({
    where: {
      storeId,
      status: 'COMPLETED',
      createdAt: {
        gte: dateRange.startDate,
        lte: dateRange.endDate,
      },
    },
    select: {
      createdAt: true,
      grandTotal: true,
    },
  });

  // Initialize all 24 hours
  const hourlyMap = new Map<number, { count: number; revenue: number }>();
  for (let i = 0; i < 24; i++) {
    hourlyMap.set(i, { count: 0, revenue: 0 });
  }

  for (const invoice of invoices) {
    const hour = invoice.createdAt.getHours();
    const existing = hourlyMap.get(hour)!;
    existing.count += 1;
    existing.revenue += Number(invoice.grandTotal);
  }

  return Array.from(hourlyMap.entries())
    .map(([hour, data]) => ({
      hour,
      invoiceCount: data.count,
      revenue: Math.round(data.revenue * 100) / 100,
    }))
    .sort((a, b) => a.hour - b.hour);
}

/**
 * Get complete analytics dashboard data
 */
export async function getDashboardAnalytics(
  storeId: string,
  dateRange: DateRange
): Promise<AnalyticsDashboard> {
  const [summary, dailySales, topProducts, categorySales, hourlyDistribution] = await Promise.all([
    getSalesSummary(storeId, dateRange),
    getDailySales(storeId, dateRange),
    getTopProducts(storeId, dateRange),
    getCategorySales(storeId, dateRange),
    getHourlyDistribution(storeId, dateRange),
  ]);

  // Get low stock and expiring counts
  const [lowStockCount, expiringCount] = await Promise.all([
    prisma.product.count({
      where: {
        storeId,
        isActive: true,
        minStock: { gt: 0 },
        currentStock: { lte: prisma.product.fields.minStock },
      },
    }),
    prisma.batch.count({
      where: {
        expiryDate: {
          lte: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          gt: new Date(),
        },
        remainingQty: { gt: 0 },
        product: { storeId },
      },
    }),
  ]);

  logger.info('Analytics dashboard generated', {
    storeId,
    dateRange: `${dateRange.startDate.toISOString()} - ${dateRange.endDate.toISOString()}`,
    totalRevenue: summary.totalRevenue,
  });

  return {
    summary,
    dailySales,
    topProducts,
    categorySales,
    hourlyDistribution,
    lowStockCount,
    expiringCount,
  };
}

/**
 * Compare current period with previous period (growth calculation)
 */
export async function getGrowthMetrics(
  storeId: string,
  currentRange: DateRange
): Promise<{
  revenueGrowth: number;
  invoiceGrowth: number;
  averageOrderGrowth: number;
}> {
  // Calculate previous period (same duration)
  const durationMs = currentRange.endDate.getTime() - currentRange.startDate.getTime();
  const previousStart = new Date(currentRange.startDate.getTime() - durationMs);
  const previousEnd = new Date(currentRange.endDate.getTime() - durationMs);

  const [current, previous] = await Promise.all([
    getSalesSummary(storeId, currentRange),
    getSalesSummary(storeId, { startDate: previousStart, endDate: previousEnd }),
  ]);

  const revenueGrowth = previous.totalRevenue > 0
    ? ((current.totalRevenue - previous.totalRevenue) / previous.totalRevenue) * 100
    : 0;

  const invoiceGrowth = previous.invoiceCount > 0
    ? ((current.invoiceCount - previous.invoiceCount) / previous.invoiceCount) * 100
    : 0;

  const averageOrderGrowth = previous.averageOrderValue > 0
    ? ((current.averageOrderValue - previous.averageOrderValue) / previous.averageOrderValue) * 100
    : 0;

  return {
    revenueGrowth: Math.round(revenueGrowth * 100) / 100,
    invoiceGrowth: Math.round(invoiceGrowth * 100) / 100,
    averageOrderGrowth: Math.round(averageOrderGrowth * 100) / 100,
  };
}
