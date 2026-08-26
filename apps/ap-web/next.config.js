/** @type {import('next').NextConfig} */

/**
 * 本地任务看板需要 Node runtime 读写 markdown，不能做成 static export。
 */
const nextConfig = {
  output: 'standalone',
  // 由 scripts/clean-next.mjs 按 lstat 清理；Next 自带 rmSync 会跟随
  // standalone 里指向真实 node_modules 的 junction，第二次 build 会把依赖删掉。
  cleanDistDir: false,
  reactStrictMode: true,
  transpilePackages: [
    '@openworker/ap-agent',
    '@openworker/agent',
    '@openworker/shared',
    '@openworker/ui'
  ],
  sassOptions: {
    silenceDeprecations: ['legacy-js-api']
  },
  webpack: (config) => {
    config.resolve.extensionAlias = {
      '.js': ['.ts', '.tsx', '.js', '.jsx'],
      '.mjs': ['.mts', '.mjs']
    }
    return config
  }
}

export default nextConfig
