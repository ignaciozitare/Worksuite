import { defineConfig, mergeConfig } from 'vitest/config';
import viteConfig from './vite.config';

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      // Node environment — we only test pure domain services here.
      // If/when we add component tests, switch to 'jsdom' for those files.
      environment: 'node',
      include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
      globals: false,
    },
  }),
);
