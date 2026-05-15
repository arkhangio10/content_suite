import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import App from './App';
import { AuthProvider } from './auth/AuthContext';
import { ErrorBoundary } from './components/ErrorBoundary';
import { ToastHost } from './components/Toast';
import './index.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
      staleTime: 1000 * 30,
    },
  },
});

// NOTE: We intentionally do NOT wrap with React.StrictMode here.
// supabase-js v2 has a known issue where its internal AbortController
// gets confused by React 18's double-mount in StrictMode, leaving
// auth.signInWithPassword / .from().select() promises pending forever.
// See: https://github.com/supabase/supabase-js/issues/936
ReactDOM.createRoot(document.getElementById('root')!).render(
  <ErrorBoundary>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <ToastHost>
            <App />
          </ToastHost>
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </ErrorBoundary>,
);
