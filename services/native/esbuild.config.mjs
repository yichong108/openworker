/**
 * 将 Native 入口打成单文件 CJS，供 Desktop extraResources 携带。
 * 使用 CJS 以便安装包内 `native/index.js` 无需旁路 package.json `"type":"module"`。
 * `node:*` 内置模块由 platform:node 自动 external；Express 等依赖打进 bundle。
 */
import * as esbuild from 'esbuild'

await esbuild.build({
  entryPoints: ['src/index.ts'],
  outfile: 'dist/desktop-bundle.cjs',
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node22',
  sourcemap: false,
  logLevel: 'info'
})
