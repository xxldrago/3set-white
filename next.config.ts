import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  experimental: {
    optimizePackageImports: ['lucide-react'],
    staleTimes: {
      dynamic: 30,
      static: 180,
    },
  },
  outputFileTracingIncludes: {
    "/api/tickets/**": ["node_modules/sharp/**/*", "node_modules/@img/**/*"],
    "/**": ["generated/prisma/**/*"],
  },
};

export default nextConfig;
