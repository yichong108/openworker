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
      '@openworker/agent': path.join(root, '../../packages/agent/src/index.ts'),
      '@openworker/base-agent': path.join(root, '../../packages/base-agent/src/index.ts')
    }
  }
})
