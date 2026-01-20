import type { AppStore } from './index';
import { supabase } from '../supabaseClient';

export interface AuthStore {
  // State
  session: any | null;
  authLoading: boolean;
  
  // Actions
  setSession: (session: any | null) => void;
  setAuthLoading: (loading: boolean) => void;
  checkSession: () => Promise<void>;
  subscribeToAuth: () => () => void;
}

export const createAuthStore = (set: any): AuthStore => ({
  // Initial state
  session: null,
  authLoading: true,
  
  // Actions
  setSession: (session) => set({ session }),
  
  setAuthLoading: (authLoading) => set({ authLoading }),
  
  checkSession: async () => {
    console.log('AuthStore: checkSession called');
    try {
      const { data: { session }, error } = await supabase.auth.getSession();
      console.log('AuthStore: session check result', { session: !!session, error });
      if (error) {
        console.error('AuthStore: session check error', error);
        // Проверяем тип ошибки
        const errorName = (error as any)?.name || '';
        const errorMessage = error.message || '';
        if (errorName === 'AuthRetryableFetchError' || errorMessage.includes('Failed to fetch')) {
          console.warn('AuthStore: Network error, continuing without session');
        }
        set({ session: null, authLoading: false });
      } else {
        set({ session, authLoading: false });
      }
    } catch (error) {
      console.error('AuthStore: Error checking session:', error);
      // Обработка сетевых ошибок (AuthRetryableFetchError)
      const errorName = (error as any)?.name || '';
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (errorName === 'AuthRetryableFetchError' || errorMessage.includes('Failed to fetch')) {
        console.warn('AuthStore: Network error, continuing without session');
      }
      set({ session: null, authLoading: false });
    }
  },
  
  subscribeToAuth: () => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      set({ session });
    });
    
    return () => subscription.unsubscribe();
  },
});
