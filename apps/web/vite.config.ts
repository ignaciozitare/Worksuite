import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
      // Resuelve shared-types directamente desde el source — sin necesitar compilar el paquete
      '@worksuite/shared-types': resolve(__dirname, '../../packages/shared-types/src/index.ts'),
    },
  },
});
