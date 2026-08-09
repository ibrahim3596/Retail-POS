// AI Demand Forecasting service
// Predicts future demand based on historical sales data
import { prisma } from '@shared/database/prisma';
import { logger } from '@shared/utils/logger';

export interface DemandForecast {
  productId: string;
  productName: string;
  currentStock: number;
  predictedDemand: number; // Predicted units for next period
  recommendedOrder: number; // Recommended units to order
  confidence: number; // 0-1 confidence score
  trend: 'increasing' | 'decreasing' | 'stable';
  trendPercentage: number;
  weeklyAverage: number;
  daysOfStockRemaining: number;
}

export interface StoreForecast {
  productForecasts: DemandForecast[];
  totalPredictedRevenue: number;
  stockOutRisk: DemandForecast[];
  overStock: DemandForecast[];
  generatedAt: string;
}

/**
 * Calculate simple moving average for demand forecasting
 * In production, replace with:
 * - Exponential smoothing
 * - ARIMA models
 * - LSTM neural networks
 * - Prophet (Facebook's forecasting tool)
 */
export async function generateDemandForecast(
  storeId: string,
  forecastDays: number = 30
): Promise<StoreForecast> {
  const startTime = Date.now();

  // Get active products
  const products = await prisma.product.findMany({
    where: { storeId, isActive: true },
    select: {
      id: true,
      name: true,
      currentStock: true,
      minStock: true,
      sellingPrice: true,
    },
  });

  // Get historical sales for the last 90 days
  const lookbackDays = 90;
  const lookbackStart = new Date();
  lookbackStart.setDate(lookbackStart.getDate() - lookbackDays);

  const salesData = await prisma.invoiceItem.findMany({
    where: {
      invoice: {
        storeId,
        status: 'COMPLETED',
        createdAt: { gte: lookbackStart },
      },
    },
    select: {
      productId: true,
      quantity: true,
      createdAt: true,
    },
  });

  // Group sales by product
  const productSalesMap = new Map<string, number[]>();
  for (const sale of salesData) {
    const existing = productSalesMap.get(sale.productId) || [];
    existing.push(Number(sale.quantity));
    productSalesMap.set(sale.productId, existing);
  }

  // Generate forecasts
  const forecasts: DemandForecast[] = [];
  let totalPredictedRevenue = 0;

  for (const product of products) {
    const sales = productSalesMap.get(product.id) || [];
    const forecast = calculateProductForecast(product, sales, forecastDays, lookbackDays);
    forecasts.push(forecast);
    totalPredictedRevenue += forecast.predictedDemand * Number(product.sellingPrice);
  }

  // Identify stock-out risks and overstock
  const stockOutRisk = forecasts
    .filter((f) => f.daysOfStockRemaining < 7 && f.predictedDemand > 0)
    .sort((a, b) => a.daysOfStockRemaining - b.daysOfStockRemaining);

  const overStock = forecasts
    .filter((f) => f.daysOfStockRemaining > 90 && f.predictedDemand > 0)
    .sort((a, b) => b.daysOfStockRemaining - a.daysOfStockRemaining);

  const result: StoreForecast = {
    productForecasts: forecasts.sort((a, b) => b.predictedDemand - a.predictedDemand),
    totalPredictedRevenue: Math.round(totalPredictedRevenue * 100) / 100,
    stockOutRisk: stockOutRisk.slice(0, 10),
    overStock: overStock.slice(0, 10),
    generatedAt: new Date().toISOString(),
  };

  logger.info('Demand forecast generated', {
    storeId,
    productCount: products.length,
    forecastDays,
    processingTime: Date.now() - startTime,
  });

  return result;
}

/**
 * Calculate forecast for a single product using weighted moving average
 */
function calculateProductForecast(
  product: any,
  sales: number[],
  forecastDays: number,
  lookbackDays: number
): DemandForecast {
  // If no sales data, return zero forecast
  if (sales.length === 0) {
    return {
      productId: product.id,
      productName: product.name,
      currentStock: Number(product.currentStock),
      predictedDemand: 0,
      recommendedOrder: Number(product.minStock),
      confidence: 0,
      trend: 'stable',
      trendPercentage: 0,
      weeklyAverage: 0,
      daysOfStockRemaining: Number(product.currentStock) > 0 ? 999 : 0,
    };
  }

  // Calculate weighted moving average (recent sales weighted more heavily)
  const weightedAvg = calculateWeightedMovingAverage(sales);

  // Calculate daily average
  const dailyAverage = sales.length / lookbackDays;

  // Predict demand for forecast period
  const predictedDemand = Math.round(weightedAvg * (forecastDays / 7));

  // Calculate trend (compare recent vs older sales)
  const trend = calculateTrend(sales);

  // Calculate recommended order
  const safetyStock = Number(product.minStock) || Math.ceil(predictedDemand * 0.2);
  const recommendedOrder = Math.max(0, predictedDemand + safetyStock - Number(product.currentStock));

  // Calculate confidence based on data consistency
  const confidence = calculateConfidence(sales);

  // Calculate days of stock remaining
  const dailySalesRate = dailyAverage > 0 ? dailyAverage : 0.1;
  const daysOfStockRemaining = Math.floor(Number(product.currentStock) / dailySalesRate);

  return {
    productId: product.id,
    productName: product.name,
    currentStock: Number(product.currentStock),
    predictedDemand,
    recommendedOrder,
    confidence,
    trend: trend.direction,
    trendPercentage: trend.percentage,
    weeklyAverage: Math.round(weightedAvg * 100) / 100,
    daysOfStockRemaining,
  };
}

/**
 * Weighted moving average - recent data weighted more
 */
function calculateWeightedMovingAverage(sales: number[]): number {
  if (sales.length === 0) return 0;
  if (sales.length === 1) return sales[0];

  const weeks = 4; // 4-week lookback
  const weeklyData: number[] = [];

  // Group sales into weeks
  const salesPerWeek = Math.ceil(sales.length / weeks);
  for (let i = 0; i < weeks; i++) {
    const weekSales = sales.slice(i * salesPerWeek, (i + 1) * salesPerWeek);
    weeklyData.push(weekSales.reduce((sum, val) => sum + val, 0));
  }

  // Apply weights (most recent = highest weight)
  const weights = weeklyData.map((_, index) => index + 1);
  const totalWeight = weights.reduce((sum, w) => sum + w, 0);

  let weightedSum = 0;
  for (let i = 0; i < weeklyData.length; i++) {
    weightedSum += weeklyData[i] * weights[i];
  }

  return weeklyData.length > 0 ? weightedSum / totalWeight : 0;
}

/**
 * Calculate trend direction and percentage
 */
function calculateTrend(sales: number[]): { direction: 'increasing' | 'decreasing' | 'stable'; percentage: number } {
  if (sales.length < 4) {
    return { direction: 'stable', percentage: 0 };
  }

  const midpoint = Math.floor(sales.length / 2);
  const firstHalf = sales.slice(0, midpoint);
  const secondHalf = sales.slice(midpoint);

  const firstAvg = firstHalf.reduce((sum, val) => sum + val, 0) / firstHalf.length;
  const secondAvg = secondHalf.reduce((sum, val) => sum + val, 0) / secondHalf.length;

  const changePercent = firstAvg > 0 ? ((secondAvg - firstAvg) / firstAvg) * 100 : 0;

  let direction: 'increasing' | 'decreasing' | 'stable';
  if (changePercent > 10) {
    direction = 'increasing';
  } else if (changePercent < -10) {
    direction = 'decreasing';
  } else {
    direction = 'stable';
  }

  return { direction, percentage: Math.round(changePercent * 100) / 100 };
}

/**
 * Calculate forecast confidence based on data consistency
 * Higher consistency = higher confidence
 */
function calculateConfidence(sales: number[]): number {
  if (sales.length < 7) return 0.3; // Low confidence with little data
  if (sales.length < 14) return 0.5;
  if (sales.length < 30) return 0.7;

  // Calculate coefficient of variation
  const mean = sales.reduce((sum, val) => sum + val, 0) / sales.length;
  const variance = sales.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / sales.length;
  const stdDev = Math.sqrt(variance);
  const cv = mean > 0 ? stdDev / mean : 1;

  // Lower CV = higher confidence
  if (cv < 0.3) return 0.95;
  if (cv < 0.5) return 0.85;
  if (cv < 0.7) return 0.7;
  if (cv < 1.0) return 0.5;
  return 0.3;
}

/**
 * Get reorder recommendations for inventory management
 */
export async function getReorderRecommendations(storeId: string): Promise<
  Array<{
    productId: string;
    productName: string;
    currentStock: number;
    recommendedOrder: number;
    urgency: 'high' | 'medium' | 'low';
    supplier?: string;
  }>
> {
  const forecast = await generateDemandForecast(storeId, 30);

  const recommendations = forecast.productForecasts
    .filter((f) => f.recommendedOrder > 0)
    .map((f) => ({
      productId: f.productId,
      productName: f.productName,
      currentStock: f.currentStock,
      recommendedOrder: f.recommendedOrder,
      urgency: f.daysOfStockRemaining < 7 ? 'high' as const : f.daysOfStockRemaining < 14 ? 'medium' as const : 'low' as const,
    }))
    .sort((a, b) => {
      const urgencyOrder = { high: 0, medium: 1, low: 2 };
      return urgencyOrder[a.urgency] - urgencyOrder[b.urgency];
    });

  return recommendations;
}
