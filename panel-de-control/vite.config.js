import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  server: { host: true },
  // Three.js + mqtt.js pesan cerca de 1 MB; para este proyecto está bien.
  // Dos páginas: el gemelo (index.html) y el panel de control (panel.html).
  build: { chunkSizeWarningLimit: 1500, rollupOptions: { input: ['index.html', 'panel.html'] } },
  test: {
    include: ['test/**/*.test.js'],
    environment: 'node',
    testTimeout: 60000,
  },
});
