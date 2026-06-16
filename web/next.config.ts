import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // copertine da iTunes / Apple (host is1-ssl..is5-ssl.mzstatic.com)
    remotePatterns: [{ protocol: "https", hostname: "**.mzstatic.com" }],
  },
};

export default nextConfig;
