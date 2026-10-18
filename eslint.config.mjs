import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  {
    // intel/ is a standalone CommonJS Node service (no "type": "module").
    files: ["intel/**/*.js"],
    rules: { "@typescript-eslint/no-require-imports": "off" },
  },
  {
    // Explicit `any` is an error everywhere, including any new file.
    rules: { "@typescript-eslint/no-explicit-any": "error" },
  },
  {
    // Ratchet: files that still contain explicit `any`s only warn while they
    // are being cleaned up. Remove a file from this list once it's clean;
    // delete this block when the list is empty.
    files: [
      "src/app/api/cctv/route.ts",
      "src/app/api/cctv/us-dot-additional.ts",
      "src/app/api/cyber-intel/route.ts",
      "src/app/api/flights/airport/route.ts",
      "src/app/api/malware/route.ts",
      "src/app/api/maritime/route.ts",
      "src/app/api/news/route.ts",
      "src/app/api/osint/bgp/route.ts",
      "src/app/api/osint/cve/route.ts",
      "src/app/api/osint/dns/route.ts",
      "src/app/api/osint/ismalicious/route.ts",
      "src/app/api/osint/otx/route.ts",
      "src/app/api/osint/whois/route.ts",
      "src/app/api/satellites/enrich/route.ts",
      "src/app/api/scm-suppliers/route.ts",
      "src/app/api/threat-intel/route.ts",
      "src/app/page.tsx",
      "src/components/CyberIntelPanel.tsx",
      "src/components/EntityGraphPanel.tsx",
      "src/components/LayerPanel.tsx",
      "src/components/LiveAlerts.tsx",
      "src/components/OsintPanel.tsx",
      "src/components/OsirisMap.tsx",
      "src/lib/feeds/flights.ts",
      "src/lib/feeds/markets.ts",
      "src/lib/sdk/PolybolosClient.ts",
    ],
    rules: { "@typescript-eslint/no-explicit-any": "warn" },
  },
]);

export default eslintConfig;
