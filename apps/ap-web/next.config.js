/** @type {import('next').NextConfig} */

/**
 * 本地任务看板需要 Node runtime 读写 markdown，不能做成 static export。
 */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@openworker/ap-agent', '@openworker/agent', '@openworker/shared'],
  webpack: (config) => {
    config.resolve.extensionAlias = {
      '.js': ['.ts', '.tsx', '.js', '.jsx'],
      '.mjs': ['.mts', '.mjs']
    }
    return config
  }
}

export default nextConfig
