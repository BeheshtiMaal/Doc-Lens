import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  serverExternalPackages: ["pg", "pdf-parse", "mammoth", "word-extractor"],
};

export default nextConfig;
