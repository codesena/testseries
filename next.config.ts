import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Permit another device on the local network to load the dev HMR endpoint.
  allowedDevOrigins: ["192.168.0.5"],
};

export default nextConfig;
