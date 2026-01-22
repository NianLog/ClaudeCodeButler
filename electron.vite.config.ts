import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

export default defineConfig({
  main: {
    resolve: {
      alias: {
        '@shared': resolve('src/shared')
      }
    },
    plugins: [],
    build: {
      sourcemap: false,
      minify: true,
      rollupOptions: {
        external: ['electron'],
        output: {
          exports: 'named'
        }
      }
    }
  },
  preload: {
    plugins: [],
    build: {
      sourcemap: false,
      minify: true
    }
  },
  renderer: {
    base: './',
    resolve: {
      alias: {
        '@': resolve('src/renderer/src'),
        '@shared': resolve('src/shared')
      }
    },
    plugins: [
      react()
    ],
    server: {
      port: 5175, // 修改默认端口从5173到5175
      strictPort: true, // 严格使用指定端口，如果被占用则失败
      host: 'localhost' // 只监听本地主机
    },
    build: {
      sourcemap: false,
      minify: true,
      chunkSizeWarningLimit: 5000,
      rollupOptions: {
        output: {
          manualChunks: (id) => {
            if (!id.includes('node_modules')) return undefined

            // 只分割主要的大型模块
            if (id.includes('monaco-editor') || id.includes('@monaco-editor/react')) {
              return 'monaco-editor'
            }

            if (id.includes('recharts')) {
              return 'charts'
            }

            if (id.includes('react-markdown') || id.includes('remark-gfm')) {
              return 'markdown'
            }

            if (id.includes('react-syntax-highlighter')) {
              return 'syntax-highlighter'
            }

            // 其他依赖打包到 vendor（包含 antd/rc-*，避免循环依赖）
            return 'vendor'
          }
        }
      }
    }
  }
})