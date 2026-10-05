import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Standalone output for the Docker image (compose web service, D-06).
  output: "standalone",
  // Cheap insurance that the standalone image carries sharp's native assets
  // (`serverExternalPackages` require them from node_modules at runtime).
  // The runner already copies full node_modules; this narrows nothing away.
  outputFileTracingIncludes: {
    "/api/tickets/**": ["node_modules/sharp/**/*", "node_modules/@img/**/*"],
    "/**": ["generated/prisma/**/*"],
  },
};

export default nextConfig;
