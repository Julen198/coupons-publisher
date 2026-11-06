import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  // the panel's sections used to live at the root (/coupons, /stores…): old bookmarks and links land in /panel
  async redirects() {
    return [{ source: "/:section(clicks|clients|costs|coupons|networks|pages|settings|stores)/:rest*", destination: "/panel/:section/:rest*", permanent: false }];
  },
  partialPrefetching: true,
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
