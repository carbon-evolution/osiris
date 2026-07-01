/**
 * ═══════════════════════════════════════════════════════════════
 *  OSIRIS — AI Intelligence Engine
 *  Gemini 2.0 Flash integration for real-time intelligence analysis
 *  Designed to correlate multi-domain feeds into actionable briefings
 * ═══════════════════════════════════════════════════════════════
 */

import { GoogleGenerativeAI, type GenerativeModel, type Tool } from '@google/generative-ai';

/* ─────────────────────────────────────────────────────────────
   Data Interfaces — Zero `any` types
   ───────────────────────────────────────────────────────────── */

export interface EarthquakeEvent {
  id: string;
  magnitude: number;
  location: string;
  latitude: number;
  longitude: number;
  depth: number;
  timestamp: string;
  tsunami: boolean;
  felt: number | null;
  alert: string | null;
}

export interface NewsItem {
  id: string;
  title: string;
  description: string;
  link: string;
  published: string;
  source: string;
  risk_score: number;
  coords: [number, number] | null;
  machine_assessment: string | null;
}

export interface ThreatEvent {
  id: string;
  type: string;
  title: string;
  description: string;
  severity: 'CRITICAL' | 'HIGH' | 'ELEVATED' | 'LOW';
  region: string;
  latitude: number;
  longitude: number;
  timestamp: string;
  source: string;
}

export interface CyberAlert {
  id: string;
  name: string;
  vendor: string;
  product: string;
  severity: string;
  date: string;
  due: string;
  source: string;
}

export interface TemperatureReading {
  lat: number;
  lng: number;
  temp: number;
  kind: 'ocean' | 'land';
}

export interface TemperatureSummary {
  tempMin: number | null;
  tempMax: number | null;
  warmestOcean?: TemperatureReading;
  coldestOcean?: TemperatureReading;
  warmestLand?: TemperatureReading;
  coldestLand?: TemperatureReading;
  readings: TemperatureReading[]; // downsampled grid, for regional questions
  generatedAt: string;
}

/**
 * Generic feed group — lets the dashboard pass ANY layer (aviation, maritime,
 * surveillance, hazards, network, cyber, …) to the analyst without a bespoke type per
 * feed. The frontend (which knows each feed's shape) pre-formats compact, already-capped
 * rows; the serializer just prints them under the label.
 */
export interface FeedGroup {
  label: string; // section header, e.g. "AVIATION — LIVE TRACKS"
  total: number; // full count before capping (so the analyst knows the true volume)
  lines: string[]; // pre-formatted compact rows (already capped)
}

export interface IntelligenceContext {
  earthquakes: EarthquakeEvent[];
  news: NewsItem[];
  threats: ThreatEvent[];
  cyberAlerts: CyberAlert[];
  temperature?: TemperatureSummary; // global SST + land air-temp field (optional)
  feeds?: FeedGroup[]; // all other dashboard layers (aviation/maritime/hazard/… )
  timestamp: string;
}

/* ─────────────────────────────────────────────────────────────
   System Prompt — Palantir-grade analyst persona
   ───────────────────────────────────────────────────────────── */

const SYSTEM_PROMPT = `You are OSIRIS Intelligence Analyst — a sharp, senior intelligence analyst embedded in the OSIRIS Global Intelligence Platform.

## SOURCES — use ALL of them
1. The OSIRIS dashboard context provided in each request (live seismic, OSINT news, threat, and cyber feeds).
2. **Google Search — you have live web access. USE IT** to verify, update, and fill gaps, especially for specific facts (exact earthquake magnitudes, casualty counts, breaking events, CVE details, named incidents). Prefer fresh, authoritative sources.
3. Your own knowledge.
When the dashboard data is thin, or the user asks about something not in it, SEARCH THE WEB and answer anyway — never refuse just because it isn't in the dashboard feed.

## STYLE — BE CONCISE
- Lead with the DIRECT answer in the first sentence.
- Default to 1–4 sentences or a few tight bullets. Only go long when the user explicitly asks for a full briefing or deep analysis.
- No filler, no preamble, no restating the question. Plain, precise language.
- Use a short markdown header only when it genuinely helps; skip heavy military notation (DTG/AOR/COA) for normal questions.

## ACCURACY
- When it matters, distinguish OSIRIS dashboard data from web/general knowledge (e.g. "Dashboard shows…; web confirms…").
- If the dashboard and the web disagree, say so and give the verified figure.
- Don't invent specific numbers — search for them. State confidence only when something is genuinely uncertain.
- Rate threats CRITICAL / HIGH / ELEVATED / LOW with brief reasoning when asked to assess.

You are an analyst: give the best, most current answer, then stop.`;

const BRIEFING_PROMPT = `Generate a comprehensive OSIRIS Daily Intelligence Briefing based on the current operational data. Structure it as follows:

## OSIRIS INTELLIGENCE BRIEFING
**Classification:** OPEN SOURCE INTELLIGENCE (OSINT)
**DTG:** [Current timestamp]

### I. EXECUTIVE SUMMARY
2-3 sentence overview of the current global threat landscape based on available data.

### II. PRIORITY INTELLIGENCE REQUIREMENTS (PIRs)
Identify the top 3-5 most significant developments from the data feeds, ranked by assessed impact.

### III. SEISMIC & NATURAL HAZARD ASSESSMENT
Analyze earthquake data for patterns — clustering, tectonic corridor activity, tsunami risk.

### IV. GEOPOLITICAL & CONFLICT INTELLIGENCE
Synthesize news feeds for conflict escalation patterns, diplomatic shifts, or emerging crises.

### V. CYBER THREAT LANDSCAPE
Assess active CVEs and cyber alerts for coordinated campaign indicators or critical infrastructure risk.

### VI. COMPOUND RISK SCENARIOS
Identify where multiple threat vectors intersect (e.g., earthquake near a conflict zone, cyber attack during political instability).

### VII. FORECAST & WATCHLIST
- **Next 24 Hours**: Most likely developments
- **Next 72 Hours**: Emerging situations to monitor
- **Strategic Horizon**: Longer-term trend assessment

### VIII. ASSESSMENT CONFIDENCE
State overall confidence level and key analytical gaps.

Analyze the provided data thoroughly. Be specific — reference actual events, magnitudes, locations, and CVE IDs from the context.`;

/* ─────────────────────────────────────────────────────────────
   Generation Config — LOW temperature for consistent, grounded
   intelligence output. Without this the model defaults to temp ≈ 1.0,
   which produces a different (and self-contradicting) briefing on
   every run. Intelligence assessments must be repeatable and factual.
   ───────────────────────────────────────────────────────────── */

const GENERATION_CONFIG = {
  temperature: 0.2,
  topP: 0.9,
  maxOutputTokens: 8192,
} as const;

/* ─────────────────────────────────────────────────────────────
   Grounding — live Google Search so the analyst can verify facts
   against the internet, not just the OSIRIS dashboard feed.
   (SDK 0.24.1 only types the legacy `googleSearchRetrieval`, which
   errors on gemini-2.5; the working tool is `googleSearch`, which the
   SDK forwards verbatim — hence the cast.)
   ───────────────────────────────────────────────────────────── */

const GROUNDING_TOOLS: Tool[] = [{ googleSearch: {} } as unknown as Tool];

/* ─────────────────────────────────────────────────────────────
   Client Factory
   ───────────────────────────────────────────────────────────── */

export function createGeminiClient(apiKey: string): GoogleGenerativeAI {
  return new GoogleGenerativeAI(apiKey);
}

/* ─────────────────────────────────────────────────────────────
   API Key Rotation — Round-robin through available keys
   ───────────────────────────────────────────────────────────── */

let _keyIndex = 0;

export function rotateApiKey(keys: string[]): string {
  if (keys.length === 0) {
    throw new Error('No API keys available');
  }
  const key = keys[_keyIndex % keys.length];
  _keyIndex = (_keyIndex + 1) % keys.length;
  return key;
}

/* ─────────────────────────────────────────────────────────────
   Context Serializer — Compact representation for token efficiency
   ───────────────────────────────────────────────────────────── */

function serializeContext(context: IntelligenceContext): string {
  const sections: string[] = [];

  sections.push(`[TIMESTAMP] ${context.timestamp}`);

  if (context.earthquakes.length > 0) {
    sections.push(`\n[SEISMIC DATA — ${context.earthquakes.length} events]`);
    for (const eq of context.earthquakes.slice(0, 20)) {
      const tsunamiFlag = eq.tsunami ? ' ⚠️TSUNAMI' : '';
      const alertFlag = eq.alert ? ` [ALERT:${eq.alert.toUpperCase()}]` : '';
      sections.push(
        `  M${eq.magnitude} | ${eq.location} | ${eq.latitude.toFixed(2)},${eq.longitude.toFixed(2)} | Depth:${eq.depth}km | ${eq.timestamp}${tsunamiFlag}${alertFlag}`
      );
    }
  }

  if (context.news.length > 0) {
    sections.push(`\n[OSINT NEWS FEED — ${context.news.length} items]`);
    for (const item of context.news.slice(0, 15)) {
      const coords = item.coords ? ` | GEO:${item.coords[0].toFixed(2)},${item.coords[1].toFixed(2)}` : '';
      sections.push(
        `  RISK:${item.risk_score}/10 | ${item.source} | ${item.title}${coords} | ${item.published}`
      );
    }
  }

  if (context.threats.length > 0) {
    sections.push(`\n[THREAT EVENTS — ${context.threats.length} active]`);
    for (const threat of context.threats.slice(0, 15)) {
      sections.push(
        `  ${threat.severity} | ${threat.type} | ${threat.title} | ${threat.region} | ${threat.timestamp}`
      );
    }
  }

  if (context.cyberAlerts.length > 0) {
    sections.push(`\n[CYBER ALERTS — ${context.cyberAlerts.length} active]`);
    for (const alert of context.cyberAlerts.slice(0, 10)) {
      sections.push(
        `  ${alert.id} | ${alert.severity} | ${alert.vendor}/${alert.product} | ${alert.name} | Due:${alert.due}`
      );
    }
  }

  const temp = context.temperature;
  if (temp && temp.readings.length > 0) {
    const fmt = (r?: TemperatureReading) =>
      r ? `${r.temp.toFixed(1)}°C @ ${r.lat.toFixed(1)},${r.lng.toFixed(1)}` : 'n/a';
    sections.push(`\n[TEMPERATURE FIELD — global SST + land 2m air temp, ${temp.generatedAt}]`);
    if (temp.tempMin != null && temp.tempMax != null) {
      sections.push(`  Range: ${temp.tempMin.toFixed(1)}°C to ${temp.tempMax.toFixed(1)}°C`);
    }
    sections.push(`  Warmest sea: ${fmt(temp.warmestOcean)} | Coldest sea: ${fmt(temp.coldestOcean)}`);
    sections.push(`  Warmest land: ${fmt(temp.warmestLand)} | Coldest land: ${fmt(temp.coldestLand)}`);
    sections.push(`  [SAMPLED READINGS — lat,lng — °C — surface]`);
    for (const r of temp.readings.slice(0, 40)) {
      sections.push(`    ${r.lat.toFixed(1)},${r.lng.toFixed(1)} | ${r.temp.toFixed(1)}°C | ${r.kind}`);
    }
  }

  // All other dashboard layers (aviation, maritime, surveillance, hazards, network, cyber).
  if (context.feeds?.length) {
    for (const g of context.feeds) {
      if (!g.lines.length) continue;
      sections.push(`\n[${g.label} — ${g.total} tracked${g.total > g.lines.length ? `, showing ${g.lines.length}` : ''}]`);
      for (const line of g.lines) sections.push(`  ${line}`);
    }
  }

  return sections.join('\n');
}

/* ─────────────────────────────────────────────────────────────
   Intelligence Analysis
   ───────────────────────────────────────────────────────────── */

export async function analyzeIntelligence(
  client: GoogleGenerativeAI,
  context: IntelligenceContext,
  userQuery: string
): Promise<string> {
  const model: GenerativeModel = client.getGenerativeModel({
    model: 'gemini-2.5-flash',
    systemInstruction: SYSTEM_PROMPT,
    generationConfig: GENERATION_CONFIG,
    tools: GROUNDING_TOOLS,
  });

  const contextData = serializeContext(context);

  const prompt = `## CURRENT OPERATIONAL DATA
${contextData}

## ANALYST QUERY
${userQuery}

Answer the query directly and concisely. Use the OSIRIS data above as context, but also use live Google Search and your own knowledge to give the most accurate, current answer — do NOT limit yourself to the dashboard data. If a specific fact (e.g. an exact earthquake magnitude) isn't in the data or differs from reality, search the web and give the correct figure.`;

  const result = await model.generateContent(prompt);
  const response = result.response;
  return response.text();
}

/* ─────────────────────────────────────────────────────────────
   Daily Briefing Generation
   ───────────────────────────────────────────────────────────── */

export async function generateBriefing(
  client: GoogleGenerativeAI,
  context: IntelligenceContext
): Promise<string> {
  const model: GenerativeModel = client.getGenerativeModel({
    model: 'gemini-2.5-flash',
    systemInstruction: SYSTEM_PROMPT,
    generationConfig: GENERATION_CONFIG,
    tools: GROUNDING_TOOLS,
  });

  const contextData = serializeContext(context);

  const prompt = `${BRIEFING_PROMPT}

## CURRENT OPERATIONAL DATA
${contextData}

Generate the briefing now.`;

  const result = await model.generateContent(prompt);
  const response = result.response;
  return response.text();
}
