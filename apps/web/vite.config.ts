import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@worksuite/shared-types': path.resolve(__dirname, '../../packages/shared-types/src/index.ts'),
      '@worksuite/i18n':         path.resolve(__dirname, '../../packages/i18n/src/index.ts'),
      '@worksuite/ui':           path.resolve(__dirname, '../../packages/ui/src/index.ts'),
      '@worksuite/jira-client':  path.resolve(__dirname, '../../packages/jira-client/src/index.ts'),
    },
  },
});
