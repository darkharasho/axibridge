import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
    plugins: [react()],
    base: './',
    root: '.',
    publicDir: 'public',
    build: {
        outDir: 'dist-web',
        emptyOutDir: true,
        rollupOptions: {
            input: path.resolve(__dirname, 'web/index.html')
        }
    }
});
