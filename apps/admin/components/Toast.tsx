'use client';

import toast, { Toaster, ToastOptions } from 'react-hot-toast';

// ScanNeo brand colors
const brandColors = {
  brightGreen: '#00B140',
  darkBlueGreen: '#1C2F38',
  limeGreen: '#A6CE39',
  deepBlue: '#4C4FA3',
};

// Toast configuration with ScanNeo branding
export const toastConfig: ToastOptions = {
  duration: 4000,
  style: {
    background: '#fff',
    color: '#1C2F38',
    padding: '16px',
    borderRadius: '8px',
    fontSize: '14px',
    fontFamily: 'Montserrat, Inter, sans-serif',
    boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
  },
};

// Toast provider component
export function ToastProvider() {
  return (
    <Toaster
      position="top-right"
      toastOptions={toastConfig}
      containerStyle={{
        top: 20,
        right: 20,
      }}
    />
  );
}

// Helper functions for common toast scenarios
export const showToast = {
  success: (message: string) => {
    toast.success(message, {
      ...toastConfig,
      style: {
        ...toastConfig.style,
        border: `1px solid ${brandColors.brightGreen}20`,
        color: brandColors.darkBlueGreen,
      },
      iconTheme: {
        primary: brandColors.brightGreen,
        secondary: '#fff',
      },
    });
  },

  error: (message: string) => {
    toast.error(message, {
      ...toastConfig,
      style: {
        ...toastConfig.style,
        border: '1px solid #EF444420',
        color: brandColors.darkBlueGreen,
      },
      iconTheme: {
        primary: '#EF4444',
        secondary: '#fff',
      },
    });
  },

  loading: (message: string) => {
    return toast.loading(message, {
      ...toastConfig,
      style: {
        ...toastConfig.style,
        border: `1px solid ${brandColors.deepBlue}20`,
      },
    });
  },

  promise: <T,>(
    promise: Promise<T>,
    messages: {
      loading: string;
      success: string | ((data: T) => string);
      error: string | ((err: unknown) => string);
    }
  ) => {
    return toast.promise(
      promise,
      {
        loading: messages.loading,
        success: messages.success,
        error: messages.error,
      },
      toastConfig
    );
  },

  dismiss: (toastId?: string) => {
    if (toastId) {
      toast.dismiss(toastId);
    } else {
      toast.dismiss();
    }
  },
};

export default showToast;
