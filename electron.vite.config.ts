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
      rollupOptions: {
        external: ['electron']
      }
    }
  },
  preload: {
    plugins: []
  },
  renderer: {
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
      rollupOptions: {
        output: {
          manualChunks: {
            vendor: ['react', 'react-dom'],
            antd: ['antd'],
            charts: ['recharts'],
            // Monaco Editor 相关 chunks
            monacoEditor: ['monaco-editor', '@monaco-editor/react']
          }
        }
      }
    }
  }
})