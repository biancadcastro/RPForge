import type { NextConfig } from "next";
const config: NextConfig = {
  output: "export",
  trailingSlash: true,
  images: { unoptimized: true },
  poweredByHeader: false,
  devIndicators: false,
  experimental: { cpus: 2 },
  turbopack: { root: process.cwd() },
};
export default config;
