import { defineConfig, loadEnv, type Plugin, type ViteDevServer } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'

const playgroundRoot = fileURLToPath(new URL('.', import.meta.url))
const repoRoot = resolve(playgroundRoot, '../../..')
const packagesRoot = resolve(repoRoot, 'packages')

function workspaceSrc(pkg: string): string {
  return resolve(packagesRoot, pkg, 'src/index.ts')
}

/**
 * 把仓库根 / ap-web 的 .env 写入 process.env（不覆盖已有值）。
 *
 * @param mode - Vite mode
 */
function hydrateProcessEnv(mode: string): void {
  process.env.OW_PLAYGROUND_REPO_ROOT = repoRoot
  const dirs = [
    playgroundRoot,
    repoRoot,
    resolve(repoRoot, 'apps/ap-web'),
    resolve(repoRoot, 'apps/ap-cli')
  ]
  for (const dir of dirs) {
    const env = loadEnv(mode, dir, '')
    for (const [key, value] of Object.entries(env)) {
      if (process.env[key] == null && value) process.env[key] = value
    }
  }
}

/**
 * 用 BaseAgentWithAGUI 在 Vite 服务端跑 AG-UI，经 SSE 送给 playground 页。
 *
 * @returns Vite 插件
 */
function playgroundAgentPlugin(): Plugin {
  return {
    name: 'ow-ui-playground-base-agent',
    configureServer(server: ViteDevServer) {
      server.middlewares.use((req, res, next) => {
        const url = req.url?.split('?')[0] ?? ''
        if (!url.startsWith('/api/agent')) {
          next()
          return
        }
        void server
          .ssrLoadModule('/server/agent-api.ts')
          .then((mod: { handleAgentApi: typeof import('./server/agent-api').handleAgentApi }) =>
            mod.handleAgentApi(req, res, next)
          )
          .catch((error: unknown) => {
            if (res.headersSent || res.writableEnded) return
            res.statusCode = 500
            res.setHeader('Content-Type', 'application/json; charset=utf-8')
            res.end(
              JSON.stringify({
                message: error instanceof Error ? error.message : String(error)
              })
            )
          })
      })
    }
  }
}

/** ChatSession 组件预览页的 Vite 配置 */
export default defineConfig(({ mode }) => {
  hydrateProcessEnv(mode)
  return {
    root: playgroundRoot,
    envDir: repoRoot,
    plugins: [react(), playgroundAgentPlugin()],
    resolve: {
      alias: {
        '@openworker/base-agent': workspaceSrc('base-agent'),
        '@openworker/llm': workspaceSrc('llm'),
        '@openworker/tools': workspaceSrc('tools'),
        '@openworker/shared': workspaceSrc('shared')
      }
    },
    ssr: {
      noExternal: [
        '@openworker/base-agent',
        '@openworker/llm',
        '@openworker/tools',
        '@openworker/shared'
      ]
    },
    server: {
      port: 5179,
      strictPort: false,
      fs: {
        allow: [repoRoot]
      }
    },
    optimizeDeps: {
      exclude: ['@openworker/base-agent', '@openworker/llm', '@openworker/tools']
    }
  }
})
