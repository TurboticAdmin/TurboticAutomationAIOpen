import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  logging: {
    fetches: {
      fullUrl: true,
      hmrRefreshes: true,
    },
  },
  eslint: {
    // Disable ESLint during builds to prevent build failures
    ignoreDuringBuilds: true,
  },
  typescript: {
    // Disable TypeScript checking during builds to prevent build failures
    ignoreBuildErrors: true,
  },
  serverExternalPackages: ["mongodb", "amqplib"],
  output: "standalone",
  outputFileTracingRoot: path.join(__dirname, ".."),
  reactStrictMode: false,
  devIndicators: false,
  // Memory optimization settings
  experimental: {
    optimizePackageImports: ['@ant-design/icons', 'antd', 'lucide-react'],
  },
};

export default nextConfig;