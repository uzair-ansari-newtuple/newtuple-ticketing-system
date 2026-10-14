import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // These load native code or worker scripts by file path, so they must not be bundled.
  serverExternalPackages: ["tesseract.js", "sharp", "onnxruntime-node", "@huggingface/transformers", "zxing-wasm"],
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
