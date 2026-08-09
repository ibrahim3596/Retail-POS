// Customer credit ledger state
import { create } from 'zustand';
import apiClient from '../../shared/api/client';

interface Customer {
  id: string;
  name: string;
  phone?: string;
  email?: string;
  balance: number;
  creditLimit: number;
}

interface LedgerEntry {
  id: string;
  type: 'DEBIT' | 'CREDIT';
  amount: number;
  balance: number;
  notes?: string;
  createdAt: string;
}

interface CustomerState {
  customers: Customer[];
  selectedCustomer: (Customer & { creditLedger: LedgerEntry[] }) | null;
  outstanding: { totalOutstanding: number; customerCount: number } | null;
  isLoading: boolean;
  error: string | null;
  fetchCustomers: (search?: string) => Promise<void>;
  fetchCustomerLedger: (id: string) => Promise<void>;
  fetchOutstanding: () => Promise<void>;
  createCustomer: (data: Omit<Customer, 'id' | 'balance'>) => Promise<boolean>;
  recordPayment: (customerId: string, amount: number, notes?: string) => Promise<boolean>;
  clearSelection: () => void;
}

export const useCustomerStore = create<CustomerState>((set, get) => ({
  customers: [],
  selectedCustomer: null,
  outstanding: null,
  isLoading: false,
  error: null,

  fetchCustomers: async (search?: string) => {
    set({ isLoading: true, error: null });
    try {
      const response = await apiClient.get('/customers', { params: { search } });
      set({ customers: response.data.data, isLoading: false });
    } catch (error: any) {
      set({ error: error.response?.data?.error?.message || 'Failed to load customers', isLoading: false });
    }
  },

  fetchCustomerLedger: async (id: string) => {
    set({ isLoading: true, error: null });
    try {
      const response = await apiClient.get(`/customers/${id}`);
      set({ selectedCustomer: response.data.data, isLoading: false });
    } catch (error: any) {
      set({ error: error.response?.data?.error?.message || 'Failed to load ledger', isLoading: false });
    }
  },

  fetchOutstanding: async () => {
    try {
      const response = await apiClient.get('/customers/outstanding');
      set({ outstanding: response.data.data });
    } catch {
      // Silent fail for outstanding
    }
  },

  createCustomer: async (data) => {
    try {
      await apiClient.post('/customers', data);
      await get().fetchCustomers();
      return true;
    } catch (error: any) {
      set({ error: error.response?.data?.error?.message || 'Failed to create customer' });
      return false;
    }
  },

  recordPayment: async (customerId, amount, notes) => {
    try {
      await apiClient.post(`/customers/${customerId}/payments`, { amount, notes });
      await get().fetchCustomerLedger(customerId);
      await get().fetchCustomers();
      return true;
    } catch (error: any) {
      set({ error: error.response?.data?.error?.message || 'Failed to record payment' });
      return false;
    }
  },

  clearSelection: () => set({ selectedCustomer: null }),
}));
