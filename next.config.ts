import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  // Loaded by Node at runtime instead of bundled: cdp-sdk lazily imports optional x402 add-ons we don't install.
  serverExternalPackages: ["@coinbase/cdp-sdk"],
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
