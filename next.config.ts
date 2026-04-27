import type { NextConfig } from "next";

const config: NextConfig = {
  reactStrictMode: true,
  experimental: { typedRoutes: false },
  // pdfkit needs runtime access to its bundled .afm font files; Next's
  // bundling rewrites the paths, so load it from node_modules at runtime.
  serverExternalPackages: ["pdfkit"],
};

export default config;
