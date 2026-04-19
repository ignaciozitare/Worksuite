import { StrictMode, useState, useCallback } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from '@/shared/hooks/useAuth';
import { I18nProvider, getStoredLocale, storeLocale, type Locale } from '@worksuite/i18n';
import { DialogProvider } from '@worksuite/ui';
import { AppRouter } from './AppRouter';

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 1, staleTime: 30_000 } } });
const root = document.getElementById('root');
if (!root) throw new Error('Root element not found');

function App() {
  const [locale, setLocaleState] = useState<Locale>(getStoredLocale);
  const setLocale = useCallback((l: Locale) => {
    storeLocale(l);
    setLocaleState(l);
  }, []);

  return (
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <I18nProvider locale={locale} setLocale={setLocale}>
          <AuthProvider>
            <DialogProvider>
              <AppRouter />
            </DialogProvider>
          </AuthProvider>
        </I18nProvider>
      </QueryClientProvider>
    </StrictMode>
  );
}

createRoot(root).render(<App />);
