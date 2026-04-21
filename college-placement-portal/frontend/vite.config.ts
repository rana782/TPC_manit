import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, process.cwd(), '');
    const backendPort = env.VITE_PROXY_BACKEND_PORT || '5001';

    return {
        plugins: [react()],
        server: {
            port: 3000,
            host: true,
            proxy: {
                '/api': {
                    target: `http://127.0.0.1:${backendPort}`,
                    changeOrigin: true,
                },
                // Resume PDFs / uploads are served by Express under /uploads — not the Vite dev server.
                '/uploads': {
                    target: `http://127.0.0.1:${backendPort}`,
                    changeOrigin: true,
                },
            },
        },
        preview: {
            port: 4173,
            host: true,
        },
    };
});
