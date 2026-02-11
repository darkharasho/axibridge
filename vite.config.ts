import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
    plugins: [react()],
    base: './', // Important for Electron to find assets
    server: {
        watch: {
            // Local web report generation writes here; ignore to avoid HMR loops in Electron dev.
            ignored: ['**/web/**', '**/dist-web/**', '**/dev/**']
        }
    },
    build: {
        outDir: 'dist-react',
        emptyOutDir: true,
    }
})
