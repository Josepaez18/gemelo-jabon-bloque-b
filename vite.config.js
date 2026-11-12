import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  server: { host: true },
  // Three.js + mqtt.js pesan cerca de 1 MB; para este proyecto está bien.
  build: { chunkSizeWarningLimit: 1500 },
  test: {
    include: ['test/**/*.test.js'],
    environment: 'node',
    testTimeout: 60000,
  },
});
