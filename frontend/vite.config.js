import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// https://vite.dev/config/
export default defineConfig(({ command, mode }) => {
  const isProd = mode === 'production'
  const isBuild = command === 'build'

  return {
    plugins: [vue()],
    test: {
      globals: true,
      environment: 'happy-dom',
    },
    build: {
      // 프로덕션 빌드 최적화 - terser로 console 완전 제거
      minify: isBuild ? 'terser' : false,
      terserOptions: isBuild ? {
        compress: {
          drop_console: true,
          drop_debugger: true,
          pure_funcs: ['console.log', 'console.info', 'console.debug', 'console.warn']
        },
        format: {
          comments: false,
        },
      } : {},
      sourcemap: false,
      rollupOptions: {
        output: {
          // 청크 분리 최적화
          manualChunks: {
            'vendor': ['vue'],
            'socket': ['socket.io-client'],
          },
        },
      },
    },
  }
})
