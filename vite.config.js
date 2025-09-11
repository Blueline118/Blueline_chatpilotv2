import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true,        // luistert op 0.0.0.0
    strictPort: true,  // forceer 5173 (niet auto-switchen)
  }
});
