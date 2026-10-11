import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Node-only packages that must not be bundled (font files, native drivers, browser automation).
  serverExternalPackages: ["pdfkit", "mongoose", "playwright-core", "nodemailer", "unpdf"],
  poweredByHeader: false,
  // This folder is the project root even when a parent folder has its own lockfile.
  outputFileTracingRoot: __dirname,
};

export default nextConfig;
