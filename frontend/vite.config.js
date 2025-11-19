import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const isProd = mode === 'production'

  return {
    plugins: [vue()],
    test: {
      globals: true,
      environment: 'happy-dom',
    },
    build: {
      // 프로덕션 빌드 최적화
      minify: 'esbuild',
      sourcemap: !isProd, // 프로덕션에서는 소스맵 비활성화
      rollupOptions: {
        output: {
          // 청크 분리 최적화
          manualChunks: {
            'vendor': ['vue'],
            'socket': ['socket.io-client'],
          },
        },
      },
      esbuild: {
        // 프로덕션에서 console 제거
        drop: isProd ? ['console', 'debugger'] : [],
      },
    },
  }
})
