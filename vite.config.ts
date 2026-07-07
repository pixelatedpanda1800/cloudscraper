import { defineConfig } from 'vite';

export default defineConfig({
  // Honor an externally assigned port (e.g. preview harnesses); default 5173.
  server: { port: Number(process.env.PORT) || 5173 },
});
