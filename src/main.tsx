// Safely patch performance.measure and performance.mark to prevent crashes in sandboxed iframes
if (typeof window !== 'undefined' && window.performance) {
  const originalMeasure = window.performance.measure;
  if (originalMeasure) {
    window.performance.measure = function (
      measureName: string,
      startMarkOrOptions?: any,
      endMark?: any
    ) {
      try {
        return originalMeasure.apply(this, arguments as any);
      } catch (e) {
        try {
          if (typeof startMarkOrOptions === 'string') {
            return originalMeasure.call(this, measureName, startMarkOrOptions, endMark);
          } else {
            return originalMeasure.call(this, measureName);
          }
        } catch (innerErr) {
          return {} as any;
        }
      }
    };
  }

  const originalMark = window.performance.mark;
  if (originalMark) {
    window.performance.mark = function (markName: string, markOptions?: any) {
      try {
        return originalMark.apply(this, arguments as any);
      } catch (e) {
        try {
          return originalMark.call(this, markName);
        } catch (innerErr) {
          return {} as any;
        }
      }
    };
  }
}

import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from './App.tsx';
import './index.css';

const queryClient = new QueryClient();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
);

