/** @type {import('next').NextConfig} */

/**
 * 本地任务看板需要 Node runtime 读写 markdown，不能做成 static export。
 */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    serverComponentsExternalPackages: ['@cursor/sdk']
  }
}

export default nextConfig
