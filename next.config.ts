import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Standalone output for the Docker image (compose web service, D-06).
  output: "standalone",
};

export default nextConfig;
