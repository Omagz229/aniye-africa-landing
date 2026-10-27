import type { NextConfig } from "next";

// PRIV-001 (M-5): the assessment pages handle contact details. They are never
// cached and never send a Referer. Exported so validate:privacy can check them.
export const ASSESSMENT_PRIVACY_PATHS = ["/assessment", "/report", "/verify"] as const;

export const ASSESSMENT_PRIVACY_HEADERS = [
  { key: "Referrer-Policy", value: "no-referrer" },
  { key: "Cache-Control", value: "no-store" },
];

const nextConfig: NextConfig = {
  async headers() {
    return ASSESSMENT_PRIVACY_PATHS.map((source) => ({
      source,
      headers: ASSESSMENT_PRIVACY_HEADERS,
    }));
  },
};

export default nextConfig;
