import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
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
    ],
    resolve: {
        alias: {
            "@": path.resolve(__dirname, "./src"),
        },
    },
}));
