// Supplier management state
import { create } from 'zustand';
import apiClient from '../../shared/api/client';

interface Supplier {
  id: string;
  name: string;
  phone?: string;
  email?: string;
  gstin?: string;
  address?: string;
}

interface SupplierState {
  suppliers: Supplier[];
  isLoading: boolean;
  error: string | null;
  fetchSuppliers: (search?: string) => Promise<void>;
  createSupplier: (data: Omit<Supplier, 'id'>) => Promise<boolean>;
  updateSupplier: (id: string, data: Partial<Supplier>) => Promise<boolean>;
  deleteSupplier: (id: string) => Promise<boolean>;
}

export const useSupplierStore = create<SupplierState>((set, get) => ({
  suppliers: [],
  isLoading: false,
  error: null,

  fetchSuppliers: async (search?: string) => {
    set({ isLoading: true, error: null });
    try {
      const response = await apiClient.get('/suppliers', { params: { search } });
      set({ suppliers: response.data.data, isLoading: false });
    } catch (error: any) {
      set({ error: error.response?.data?.error?.message || 'Failed to load suppliers', isLoading: false });
    }
  },

  createSupplier: async (data) => {
    try {
      await apiClient.post('/suppliers', data);
      await get().fetchSuppliers();
      return true;
    } catch (error: any) {
      set({ error: error.response?.data?.error?.message || 'Failed to create supplier' });
      return false;
    }
  },

  updateSupplier: async (id, data) => {
    try {
      await apiClient.put(`/suppliers/${id}`, data);
      await get().fetchSuppliers();
      return true;
    } catch (error: any) {
      set({ error: error.response?.data?.error?.message || 'Failed to update supplier' });
      return false;
    }
  },

  deleteSupplier: async (id) => {
    try {
      await apiClient.delete(`/suppliers/${id}`);
      await get().fetchSuppliers();
      return true;
    } catch (error: any) {
      set({ error: error.response?.data?.error?.message || 'Failed to delete supplier' });
      return false;
    }
  },
}));
