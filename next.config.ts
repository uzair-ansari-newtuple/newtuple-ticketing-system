import type { NextConfig } from "next";

const apiOrigin = process.env.API_ORIGIN;

const ML_ROUTES = ["/api/sm/analyze", "/api/sm/identify", "/api/sm/map-attributes", "/api/mock/library", "/api/mock/library/reindex"];
const forMlRoutes = (files: string[]) => Object.fromEntries(ML_ROUTES.map((route) => [route, files]));

const nextConfig: NextConfig = {
  // The frontend and the backend run as two servers, so each keeps its own build folder.
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
  // These load native code or worker scripts by file path, so they must not be bundled.
  serverExternalPackages: ["tesseract.js", "sharp", "onnxruntime-node", "@huggingface/transformers", "zxing-wasm"],
  // The image analysis loads native code by path, so the trace has to be told to ship it. The image vectors come from Jina on Vercel, so the in-server model is not shipped. Only
  // the routes that read photos need it, so the other routes stay small and Vercel keeps them together in few functions.
  outputFileTracingIncludes: forMlRoutes([
    "./node_modules/tesseract.js/**/*",
    "./node_modules/tesseract.js-core/**/*",
    "./node_modules/zxing-wasm/**/*",
  ]),
  outputFileTracingExcludes: forMlRoutes(["./node_modules/onnxruntime-web/**"]),
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
