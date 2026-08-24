import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

const root = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts']
  },
  resolve: {
    alias: {
      // 包 exports 指向 dist；单测走源码，才能 mock 到 createBaseAgent 内部的 runReActLoop
      '@openworker/base-agent': path.join(root, '../base-agent/src/index.ts')
    }
  }
})
