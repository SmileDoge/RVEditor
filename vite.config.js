import { defineConfig } from 'vite';

export default defineConfig(({ mode }) => ({
    base: mode === 'gh-pages' ? '/RVEditor/' : '/',

    build: {
        target: 'chrome80' // for gmod cef
    },

    optimizeDeps: {
        rolldownOptions: {
            transform: {
                target: 'chrome80'
            }
        }
    }
}));