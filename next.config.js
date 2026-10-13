/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // PGlite(WASM) と postgres はバンドルせず Node から直接読み込む
    serverComponentsExternalPackages: ['@electric-sql/pglite', 'postgres'],
  },
};
module.exports = nextConfig;
