import type { AppStore } from './index';

export interface AuthFormStore {
  // Auth form state
  email: string;
  otpCode: string;
  step: "email" | "code";
  loading: boolean;
  error: string | null;
  message: string | null;
  
  // Actions
  setEmail: (email: string) => void;
  setOtpCode: (otpCode: string) => void;
  setStep: (step: "email" | "code") => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  setMessage: (message: string | null) => void;
  resetForm: () => void;
}

export const createAuthFormStore = (set: any): AuthFormStore => ({
  // Initial state
  email: "",
  otpCode: "",
  step: "email",
  loading: false,
  error: null,
  message: null,
  
  // Actions
  setEmail: (email) => set({ email }),
  setOtpCode: (otpCode) => set({ otpCode }),
  setStep: (step) => set({ step }),
  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error }),
  setMessage: (message) => set({ message }),
  
  resetForm: () => set({
    email: "",
    otpCode: "",
    step: "email",
    loading: false,
    error: null,
    message: null,
  }),
});
