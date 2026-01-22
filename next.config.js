/** @type {import('next').NextConfig} */
const nextConfig = {
  // Disable React strict mode for development (enables double rendering detection)
  reactStrictMode: true,
  
  // Enable experimental features if needed
  experimental: {
    // serverActions are stable in Next.js 14
  },
}

module.exports = nextConfig
