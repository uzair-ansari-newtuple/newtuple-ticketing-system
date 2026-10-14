import type { NextConfig } from "next";

const apiOrigin = process.env.API_ORIGIN;

const nextConfig: NextConfig = {
  // The frontend and the backend run as two servers, so each keeps its own build folder.
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
  // These load native code or worker scripts by file path, so they must not be bundled.
  serverExternalPackages: ["tesseract.js", "sharp", "onnxruntime-node", "@huggingface/transformers", "zxing-wasm"],
  // When a separate backend is configured, the frontend forwards its /api calls to it.
  async rewrites() {
    return apiOrigin ? [{ source: "/api/:path*", destination: `${apiOrigin}/api/:path*` }] : [];
  },
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
