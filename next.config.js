/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  webpack: (config, { isServer }) => {
    config.resolve.extensions = ['.ts', '.tsx', '.js', '.jsx']
    return config
  }
}

module.exports = nextConfig
