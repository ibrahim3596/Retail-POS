// API client with offline awareness and automatic retry
import axios, { AxiosInstance, AxiosError, InternalAxiosRequestConfig } from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { APP_CONFIG } from '../../config/app';

// Token storage keys
const ACCESS_TOKEN_KEY = '@auth_access_token';
const REFRESH_TOKEN_KEY = '@auth_refresh_token';

// Create axios instance
const apiClient: AxiosInstance = axios.create({
  baseURL: APP_CONFIG.API_BASE_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

/**
 * Set auth tokens in storage and axios headers
 */
export async function setTokens(accessToken: string, refreshToken: string): Promise<void> {
  await AsyncStorage.multiSet([
    [ACCESS_TOKEN_KEY, accessToken],
    [REFRESH_TOKEN_KEY, refreshToken],
  ]);
  apiClient.defaults.headers.common['Authorization'] = `Bearer ${accessToken}`;
}

/**
 * Clear auth tokens
 */
export async function clearTokens(): Promise<void> {
  await AsyncStorage.multiRemove([ACCESS_TOKEN_KEY, REFRESH_TOKEN_KEY]);
  delete apiClient.defaults.headers.common['Authorization'];
}

/**
 * Get stored access token
 */
export async function getAccessToken(): Promise<string | null> {
  return AsyncStorage.getItem(ACCESS_TOKEN_KEY);
}

/**
 * Get stored refresh token
 */
export async function getRefreshToken(): Promise<string | null> {
  return AsyncStorage.getItem(REFRESH_TOKEN_KEY);
}

// Request interceptor - attach token
apiClient.interceptors.request.use(
  async (config: InternalAxiosRequestConfig) => {
    const token = await getAccessToken();
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor - handle token refresh
apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config;

    // If 401 and we have a refresh token, try refreshing
    if (error.response?.status === 401 && originalRequest) {
      try {
        const refreshToken = await getRefreshToken();
        if (!refreshToken) {
          throw new Error('No refresh token');
        }

        const response = await axios.post(`${APP_CONFIG.API_BASE_URL}/auth/refresh`, {
          refreshToken,
        });

        const { accessToken, refreshToken: newRefreshToken } = response.data.data;
        await setTokens(accessToken, newRefreshToken);

        // Retry original request
        originalRequest.headers.Authorization = `Bearer ${accessToken}`;
        return apiClient(originalRequest);
      } catch (refreshError) {
        await clearTokens();
        throw refreshError;
      }
    }

    return Promise.reject(error);
  }
);

/**
 * Check if device is online
 */
export async function isOnline(): Promise<boolean> {
  try {
    await axios.get(`${APP_CONFIG.API_BASE_URL.replace('/api', '')}/health`, {
      timeout: 5000,
    });
    return true;
  } catch {
    return false;
  }
}

export default apiClient;
