import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'

const playgroundRoot = fileURLToPath(new URL('.', import.meta.url))

/** ChatSession 组件预览页的 Vite 配置 */
export default defineConfig({
  root: playgroundRoot,
  plugins: [react()],
  server: {
    port: 5179,
    strictPort: false
  }
})
