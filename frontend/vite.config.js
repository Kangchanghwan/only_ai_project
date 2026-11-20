import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'node:path'

// https://vite.dev/config/
export default defineConfig(({ command, mode }) => {
  const isProd = mode === 'production'
  const isBuild = command === 'build'

  return {
    plugins: [vue()],
    server: {
      port: Number(process.env.PORT) || 5173,
    },
    test: {
      globals: true,
      environment: 'happy-dom',
      setupFiles: ['./src/test/setup.js'],
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
      cssCodeSplit: true, // CSS 코드 스플리팅 활성화
      rollupOptions: {
        // 메인 앱 + 도구 페이지(/tools/, /tools/hwp/). 도구 페이지는 Vue를 쓰지 않아 메인 번들에 영향이 없다
        input: {
          main: resolve(import.meta.dirname, 'index.html'),
          tools: resolve(import.meta.dirname, 'tools/index.html'),
          toolsHwp: resolve(import.meta.dirname, 'tools/hwp/index.html'),
        },
        output: {
          // 청크 분리 최적화
          manualChunks: {
            'vendor': ['vue'],
            'socket': ['socket.io-client'],
            'i18n': ['vue-i18n'], // i18n 별도 청크
          },
        },
      },
    },
  }
})
