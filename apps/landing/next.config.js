/** @type {import('next').NextConfig} */

/**
 * GitHub Pages 项目站需要 `/<repo>` 前缀；本地开发保持空字符串。
 * CI 通过环境变量 BASE_PATH / NEXT_PUBLIC_BASE_PATH 注入。
 */
const rawBasePath = process.env.BASE_PATH || process.env.NEXT_PUBLIC_BASE_PATH || ''
const basePath = !rawBasePath || rawBasePath === '/' ? '' : rawBasePath.replace(/\/$/, '')

const nextConfig = {
  reactStrictMode: true,
  output: 'export',
  distDir: 'dist',
  // 生成 docs/index.html，便于 GitHub Pages 按目录正确解析路由
  trailingSlash: true,
  images: {
    unoptimized: true
  },
  ...(basePath
    ? {
        basePath,
        assetPrefix: basePath
      }
    : {}),
  webpack: (config) => {
    config.module.rules.push({
      test: /\.md$/,
      type: 'asset/source'
    })
    return config
  }
}

export default nextConfig
