import { execSync } from 'node:child_process'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import react from '@vitejs/plugin-react'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'

import { bootstrapChannelEnv } from '@openworker/shared/load-env'

const rootDir = fileURLToPath(new URL('.', import.meta.url))

const channel = bootstrapChannelEnv()

const rendererPort = Number(process.env.OPENWORKER_RENDERER_PORT)
const nativePort = Number(process.env.OPENWORKER_NATIVE_PORT)

if (!Number.isFinite(rendererPort) || rendererPort <= 0) {
  throw new Error('未设置有效的 OPENWORKER_RENDERER_PORT，请检查渠道环境（load-env）')
}

const nativeBaseUrl =
  process.env.OPENWORKER_NATIVE_BASE_URL?.trim() ||
  process.env.VITE_OPENWORKER_NATIVE_BASE_URL?.trim() ||
  (Number.isFinite(nativePort) && nativePort > 0 ? `http://127.0.0.1:${nativePort}` : '')

if (!process.env.VITE_API_URL?.trim()) {
  process.env.VITE_API_URL = nativeBaseUrl
}
if (!process.env.VITE_OPENWORKER_NATIVE_BASE_URL?.trim()) {
  process.env.VITE_OPENWORKER_NATIVE_BASE_URL = nativeBaseUrl
}

/**
 * 读取当前仓库短 SHA（构建「关于」信息）
 *
 * @param cwd - 仓库根或 app 目录
 */
function readGitShortHash(cwd: string): string {
  try {
    return execSync('git rev-parse --short HEAD', {
      encoding: 'utf8',
      cwd,
      stdio: ['ignore', 'pipe', 'ignore']
    }).trim()
  } catch {
    return ''
  }
}

const aliasSrc = resolve(rootDir, 'src')
const aliasShared = resolve(rootDir, '../../packages/shared/src/index.ts')
const aliasSharedLoadEnv = resolve(rootDir, '../../packages/shared/src/load-env.ts')
const aliasUi = resolve(rootDir, '../../packages/ui/src/index.ts')
/** monaco-themes 未在 package exports 中暴露 themes/，需直连磁盘路径供 Vite 解析 */
const monacoGithubLightThemeJson = resolve(
  rootDir,
  'node_modules/monaco-themes/themes/GitHub Light.json'
)

export default defineConfig({
  main: {
    define: {
      __OPENWORKERER_GIT_COMMIT__: JSON.stringify(readGitShortHash(rootDir)),
      __OPENWORKERER_BUILD_ISO__: JSON.stringify(new Date().toISOString()),
      __OPENWORKER_CHANNEL__: JSON.stringify(channel)
    },
    resolve: {
      alias: {
        '@': aliasSrc,
        '@openworker/shared/load-env': aliasSharedLoadEnv,
        '@openworker/shared': aliasShared
      }
    },
    plugins: [
      externalizeDepsPlugin({
        exclude: ['@openworker/shared', '@openworker/shared/load-env']
      })
    ],
    build: {
      rollupOptions: {
        input: {
          index: resolve(rootDir, 'src/main/index.ts')
        }
      }
    }
  },
  preload: {
    resolve: {
      alias: {
        '@': aliasSrc
      }
    },
    plugins: [externalizeDepsPlugin()],
    build: {
      // 沙箱内 preload 以非 ES 模块方式执行，需输出 CJS
      lib: {
        entry: resolve(rootDir, 'src/preload/index.ts'),
        formats: ['cjs']
      },
      rollupOptions: {
        output: {
          inlineDynamicImports: true,
          entryFileNames: 'index.cjs'
        }
      }
    }
  },
  renderer: {
    root: 'src/renderer',
    server: {
      port: rendererPort,
      strictPort: true
    },
    resolve: {
      /**
       * 强制渲染进程只使用同一份 React，避免 antd App.useApp 与 Provider
       * 落到不同 React 实例上出现 useContext(null)。
       */
      dedupe: ['react', 'react-dom'],
      alias: {
        '@': aliasSrc,
        '@openworker/shared': aliasShared,
        '@openworker/ui': aliasUi,
        '@monaco-themes/github-light': monacoGithubLightThemeJson,
        react: resolve(rootDir, 'node_modules/react'),
        'react-dom': resolve(rootDir, 'node_modules/react-dom')
      }
    },
    /** monaco-editor 的 language workers 与 dep optimizer 不兼容，预构建会生成缺失的 html.worker 等路径 */
    optimizeDeps: {
      exclude: ['monaco-editor'],
      include: ['react', 'react-dom', 'antd']
    },
    build: {
      rollupOptions: {
        input: {
          index: resolve(rootDir, 'src/renderer/index.html')
        }
      }
    },
    plugins: [react()]
  }
})
