import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@aztec/bb.js"],
  outputFileTracingRoot: __dirname,
  outputFileTracingIncludes: {
    "/_not-found": ["./node_modules/@aztec/bb.js/dest/node/barretenberg_wasm/*.wasm"],
    "/": ["./node_modules/@aztec/bb.js/dest/node/barretenberg_wasm/*.wasm"],
  },
  webpack: (config, { isServer }) => {
    config.experiments = { ...config.experiments, asyncWebAssembly: true };
    if (!isServer) {
      config.resolve = config.resolve || {};
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        path: false,
        os: false,
        crypto: false,
      };
    }
    return config;
  },
};

export default nextConfig;
