import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import { VitePWA } from "vite-plugin-pwa";
import path from "path";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
    server: {
        host: "localhost",
        port: 8080,
        strictPort: true,
        open: true,
        cors: true,
        proxy: {
            // Proxy API calls to the backend server
            '/api': {
                target: 'http://localhost:5015',
                changeOrigin: true,
                secure: false,
            }
        }
    },
    preview: {
        port: 8080,
        host: "localhost",
        strictPort: true,
    },
    plugins: [
        react(),
        VitePWA({
            registerType: 'autoUpdate',
            manifest: {
                name: 'מערכת תזכורות',
                short_name: 'תזכורות',
                description: 'מערכת תזכורות',
                dir: 'rtl',
                lang: 'he',
                display: 'standalone',
                theme_color: '#2563eb',
                background_color: '#ffffff',
                icons: [
                    {
                        src: '/pwa-192x192.png',
                        sizes: '192x192',
                        type: 'image/png',
                    },
                    {
                        src: '/pwa-512x512.png',
                        sizes: '512x512',
                        type: 'image/png',
                    },
                    {
                        src: '/pwa-512x512.png',
                        sizes: '512x512',
                        type: 'image/png',
                        purpose: 'maskable',
                    },
                ],
            },
            workbox: {
                navigateFallback: '/index.html',
                navigateFallbackDenylist: [/^\/api\//],
                cleanupOutdatedCaches: true,
            },
        }),
    ],
    resolve: {
        alias: {
            "@": path.resolve(__dirname, "./src"),
        },
    },
}));
