# Security Policy

## Responsible Usage
The OSIRIS Project provides powerful Open Source Intelligence (OSINT) and cybersecurity monitoring tools designed to visualize and analyze global threat landscapes. 

**By using this software, you agree to the following:**
1. **Defensive Use Only:** The tools, scripts, and intelligence capabilities provided in this repository must be used strictly for defensive, educational, and authorized monitoring purposes.
2. **Authorized Targets:** Do not use OSIRIS to scan, probe, or interact with infrastructure, networks, or systems that you do not own or have explicit authorization to monitor.
3. **Compliance with Laws:** You are responsible for ensuring that your use of OSIRIS complies with all applicable local, state, national, and international laws and regulations.
4. **No Malicious Intent:** Any use of OSIRIS for malicious activities, offensive cyber operations, or unauthorized data harvesting is strictly prohibited.

The creators and contributors of OSIRIS are not responsible for any misuse or damage caused by this software. Use it responsibly and ethically.

## Reporting a Vulnerability

Please **do not** report security vulnerabilities in public issues, discussions or pull requests.

**Report privately** through GitHub: **[Report a vulnerability](https://github.com/carbon-evolution/osiris/security/advisories/new)** (Security → Advisories → *Report a vulnerability*). Include:
- a description of the issue and its impact,
- steps to reproduce (affected route, request, configuration),
- the commit or release you tested.

What to expect:
- acknowledgement within **3 business days**,
- an initial assessment and severity rating within **7 days**,
- a fix or mitigation plan, coordinated disclosure, and credit in the advisory if you want it.

Supported versions: the latest release and `main`.

## Security assessment — OWASP Top 10:2025

*Assessed 2026-10-18 against commit `45da475` (`main`); re-rated the same day at `5a24bcf` after the fixes in #50–#52. Re-assess after major changes; the automated controls below run continuously.*

**Method:** manual code review of every API route and the map/popup code; CodeQL (`security-extended`) with all 34 alerts triaged; OWASP ZAP baseline scan of a production build; OpenSSF Scorecard; `npm audit` and `npm audit signatures`; ClamAV over the repository and installed dependencies; full-history gitleaks (scanner repo) and GitHub secret scanning.

**Rating scale (residual risk, after current mitigations):** **High** — exploitable weakness with material impact, fix now · **Medium** — real weakness with limited impact or partial mitigation, fix planned · **Low** — controls in place; minor or theoretical gaps.

### Summary

| # | Category | Residual risk |
|---|---|---|
| A01 | Broken Access Control | 🟢 **Low** (was Medium) |
| A02 | Security Misconfiguration | 🟠 **Medium** (improved) |
| A03 | Software Supply Chain Failures | 🟢 **Low** |
| A04 | Cryptographic Failures | 🟢 **Low** |
| A05 | Injection | 🟢 **Low** |
| A06 | Insecure Design | 🟢 **Low** (was Medium) |
| A07 | Authentication Failures | 🟢 **Low** |
| A08 | Software or Data Integrity Failures | 🟢 **Low** |
| A09 | Security Logging and Alerting Failures | 🟠 **Medium** |
| A10 | Mishandling of Exceptional Conditions | 🟢 **Low** |

**Overall: no High-risk findings; 2 Medium, 8 Low** (initial assessment: 4 Medium, 6 Low). OSIRIS is a public, read-only intelligence dashboard with no user accounts, so most risk sits in what anonymous visitors can make the server do, and in browser hardening.

### A01 — Broken Access Control · 🟢 Low
- ✅ No user data or accounts to cross-access; the dashboard is intentionally public and read-only.
- ✅ Server-to-server calls no longer trust the client: `stats` uses a fixed internal origin instead of the `Host` header (#32, #41); `/api/github-webhook` is disabled unless a secret and target are configured and always verifies the HMAC signature (#44).
- ✅ **The recon scanner proxy is closed by default** (#51): production builds refuse scans unless the operator sets `SCANNER_ACCESS_TOKEN` (sent as `X-Scanner-Token`, compared with `timingSafeEqual`; the recon panel prompts once and keeps it in `sessionStorage`) or explicitly opts in with `SCANNER_ALLOW_ANONYMOUS=true`. Zero-config access is limited to the local dev server on loopback, with cross-site and forwarded requests refused. SSRF validation and the scan-type allowlist still apply; the allowlist now checks own keys only.
- ✅ **Client IPs are only taken from forwarding headers when `TRUST_PROXY_HEADERS` is set** (#51), using the entry the trusted proxy appends rather than the client-supplied one, so rate limits can't be bypassed by forging `X-Forwarded-For`.
- ⚠️ Without `TRUST_PROXY_HEADERS`, all visitors share one rate-limit bucket per endpoint (safe, but strict). Deployments behind nginx should enable it — and must then not expose the app port directly.

### A02 — Security Misconfiguration · 🟠 Medium (improved)
ZAP baseline on `main` after #52: **0 High, 3 Medium, 1 Low, 4 Informational** alert types, 62 passive rules passed (initially 0 / 5 / 5 / 5, 60 passed).
- ✅ **Hardening headers** (#52): `Permissions-Policy` (unused device APIs denied), `Cross-Origin-Opener-Policy: same-origin`, `Cross-Origin-Resource-Policy: same-origin`; `X-Powered-By` removed.
- ✅ **CSP tightened** (#52): explicit directives with `default-src 'self'`, scripts from `'self'` only, **no `'unsafe-eval'` in production**, `object-src 'none'`, `base-uri`, `form-action` and `frame-ancestors` set; verified in a browser with 0 CSP violations.
- ⚠️ **Remaining ZAP Medium:** `script-src 'unsafe-inline'` (Next.js inline bootstrap scripts and inline `onclick` handlers in map popup HTML), `style-src 'unsafe-inline'` (React inline styles), and wildcard `https:` for images, media, frames and API connections (hundreds of data-driven camera and feed hosts). Accepted Low: no `Cross-Origin-Embedder-Policy`, which would block third-party camera media and embeds.
- ✅ HSTS and `X-Frame-Options: SAMEORIGIN` are set; the unused Next.js image optimizer (open fetch proxy) is disabled (#24); the Docker image runs as a non-root user with a writable cache directory (#27); the production build type-checks.
- **Recommended:** move the popup `onclick` handlers to `addEventListener`, then adopt CSP nonces to drop `script-src 'unsafe-inline'`.

### A03 — Software Supply Chain Failures · 🟢 Low
- ✅ `npm audit --omit=dev`: **0 vulnerabilities** (dashboard, `intel/`, scanner), enforced in CI.
- ✅ All 842 installed npm packages have **verified registry signatures** (237 with provenance attestations).
- ✅ Every GitHub Action is pinned to a commit SHA, Docker base images are pinned by digest, and Dependabot keeps npm (security), Actions and Docker updates flowing.
- ✅ ClamAV scans the source and installed dependencies (`npm ci --ignore-scripts`) on every PR: 0 infected files.
- ⚠️ 5 high-severity advisories remain in **dev-only** tooling (the `eslint-config-next` glob chain, e.g. GHSA-vfj7-8cjw-p6xm); never shipped, and npm's only fix is a major downgrade.

### A04 — Cryptographic Failures · 🟢 Low
- ✅ HSTS; external APIs over HTTPS (geolocation moved to HTTPS-only providers in #38); webhook signatures compared with `crypto.timingSafeEqual`.
- ✅ Secrets come from environment variables or git-ignored files, are excluded from Docker builds, and are covered by secret scanning with push protection.
- ⚠️ IP enrichment uses **`http://ip-api.com`** (its free tier is HTTP-only) in 7 routes — public IPs leave the server in clear text.
- ⚠️ The scanner sidecar receives its key as a URL query parameter (internal network only) and compares it non-constant-time.
- ℹ️ Users' own Gemini API keys are stored in their browser's `localStorage` by design.

### A05 — Injection · 🟢 Low
- ✅ **Map popup XSS fixed** (#25): all feed-derived values escaped, `onclick` arguments JSON-encoded, links limited to http(s); verified with a hostile payload in a real browser, covered by unit tests.
- ✅ CodeQL `security-extended` on every PR (required check): **0 open alerts**; 14 fixed, 20 triaged with written reasons.
- ✅ Shared SSRF guard (canonical IPs, private/metadata ranges blocked, DNS answers checked, redirects re-validated); strict input validation on path-spliced parameters (#32, #42); React escaping elsewhere; `renderMarkdown` escapes before formatting.
- ✅ Scanner repository: Semgrep (JavaScript, Node, secrets, command-injection rules) on every PR.

### A06 — Insecure Design · 🟢 Low
- ✅ **Analytics is opt-in and off by default**: the middleware sends nothing unless `UMAMI_URL` and `UMAMI_WEBSITE_ID` are both set (no hardcoded host or upstream site ID). The separate visitor-IP "Network Log" event was removed; page views time out after 2s and fail silently. Covered by unit tests.
- ✅ Active recon capability is no longer exposed to anonymous visitors by default (see A01).
- ⚠️ The SSRF guard checks DNS at validation time; a DNS-rebinding race remains possible (documented in `src/lib/ssrf-guard.ts`).
- ✅ Fail-closed defaults for optional integrations (webhook #44, scanner without key → 503); fixed-upstream proxies instead of caller-supplied URLs.

### A07 — Authentication Failures · 🟢 Low
- ✅ No end-user authentication surface (no accounts, passwords or sessions).
- ✅ Service credentials: webhook HMAC always required once configured; scanner access needs `SCANNER_ACCESS_TOKEN` (constant-time comparison) and the sidecar needs `SCANNER_KEY`; provider API keys are server-side only.
- ⚠️ See A04 for the sidecar key transport/comparison.

### A08 — Software or Data Integrity Failures · 🟢 Low
- ✅ `main` requires **verified signed commits** and 7 passing checks (tests, build, audit, lint, CodeQL ×3) in both repositories; force-pushes and deletion are blocked.
- ✅ Release images are **signed keylessly with Sigstore cosign** and carry SLSA provenance and an SBOM; the release verifies its own signature (`DOCKER.md` → *Verify the image signature*).
- ✅ CodeQL analyses the workflow files; workflow tokens are least-privilege.

### A09 — Security Logging and Alerting Failures · 🟠 Medium
- ✅ OSINT lookups are recorded in a Postgres `audit_log` (source, query, IP, result count); repository-level alerting comes from Dependabot, CodeQL and secret scanning.
- ⚠️ No runtime alerting: rate-limit hits, scanner abuse or repeated 401s on the webhook aren't surfaced anywhere.
- ⚠️ No documented retention for `audit_log`, which stores client IPs.

### A10 — Mishandling of Exceptional Conditions · 🟢 Low
- ✅ Graceful degradation throughout: cache-first serving of last good data, per-source error isolation (#41), timeouts on outbound fetches, non-5xx fallbacks for optional features (#38).
- ✅ Prototype-key lookups that previously caused 500s are rejected (#32, #42).
- ⚠️ Several routes return the raw error message in a `detail` field, which can leak internal hostnames or upstream errors.

### Automated security controls

| Control | Where | Runs |
|---|---|---|
| Tests, type-checked build, lint, `npm audit` | `ci.yml` | every PR (required) |
| CodeQL `security-extended` (JS/TS + Actions) | `codeql.yml` | every PR (required), weekly |
| ClamAV malware scan (source + dependencies) | `malware.yml` | every PR, weekly |
| OWASP ZAP baseline (DAST) | `zap.yml` | push to `main`, weekly — report in the `zap_scan` artifact |
| OpenSSF Scorecard | `scorecard.yml` | push to `main`, weekly — badge in the README |
| Secret scanning + push protection | GitHub settings | every push |
| Dependabot (npm security, Actions, Docker) | GitHub settings / `dependabot.yml` | continuous / weekly |
| Signed commits, branch protection | GitHub settings | every merge |
| Signed release images (cosign), provenance, SBOM | `release.yml` | every `v*` tag |

**OpenSSF Scorecard:** 8.0/10 on `main` after these changes (6.2 at the initial assessment); the remaining gaps are mostly single-maintainer factors (code review, contributors) plus fuzzing and the OpenSSF Best Practices badge.
