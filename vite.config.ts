import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// API 서버의 CORS 허용 출처가 http://localhost:5173 이므로 포트를 고정한다.
export default defineConfig({
  plugins: [react()],
  server: { port: 5173, strictPort: true },
});
