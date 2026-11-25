import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The admin portal is an authenticated, per-user, always-fresh application that handles personal
  // data. It must never be prerendered or cached across users, so Cache Components / partial
  // prefetching (enabled by the create-next-app template) are deliberately left off.
  transpilePackages: ["@bevital/shared"],
  poweredByHeader: false,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "same-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          { key: "Cache-Control", value: "no-store" },
        ],
      },
    ];
  },
};

export default nextConfig;
