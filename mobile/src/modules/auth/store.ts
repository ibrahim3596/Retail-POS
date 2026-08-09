// Auth state management with Zustand
import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import apiClient, { setTokens, clearTokens, getAccessToken } from '../../shared/api/client';

interface User {
  id: string;
  email: string;
  name: string;
  role: string;
  storeId: string;
}

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  login: (email: string, password: string) => Promise<boolean>;
  register: (data: RegisterData) => Promise<boolean>;
  logout: () => Promise<void>;
  checkAuth: () => Promise<void>;
  clearError: () => void;
}

interface RegisterData {
  email: string;
  password: string;
  name: string;
  phone?: string;
  storeName: string;
  gstin?: string;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  isAuthenticated: false,
  isLoading: false,
  error: null,

  login: async (email: string, password: string) => {
    set({ isLoading: true, error: null });
    try {
      const response = await apiClient.post('/auth/login', { email, password });
      const { user, tokens } = response.data.data;

      await setTokens(tokens.accessToken, tokens.refreshToken);
      set({ user, isAuthenticated: true, isLoading: false });
      return true;
    } catch (error: any) {
      const message = error.response?.data?.error?.message || 'Login failed';
      set({ error: message, isLoading: false });
      return false;
    }
  },

  register: async (data: RegisterData) => {
    set({ isLoading: true, error: null });
    try {
      const response = await apiClient.post('/auth/register', data);
      const { user, tokens } = response.data.data;

      await setTokens(tokens.accessToken, tokens.refreshToken);
      set({ user, isAuthenticated: true, isLoading: false });
      return true;
    } catch (error: any) {
      const message = error.response?.data?.error?.message || 'Registration failed';
      set({ error: message, isLoading: false });
      return false;
    }
  },

  logout: async () => {
    const refreshToken = await AsyncStorage.getItem('@auth_refresh_token');
    if (refreshToken) {
      try {
        await apiClient.post('/auth/logout', { refreshToken });
      } catch {
        // Ignore logout API errors
      }
    }
    await clearTokens();
    set({ user: null, isAuthenticated: false });
  },

  checkAuth: async () => {
    const token = await getAccessToken();
    if (!token) {
      set({ isAuthenticated: false });
      return;
    }

    try {
      const response = await apiClient.get('/auth/me');
      set({ user: response.data.data, isAuthenticated: true });
    } catch {
      await clearTokens();
      set({ isAuthenticated: false });
    }
  },

  clearError: () => set({ error: null }),
}));
