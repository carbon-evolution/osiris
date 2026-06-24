/**
 * Locators + parsers for the local Opencode intelligence datasets that OSIRIS
 * links to (recon outputs, EuRepoC, OTCAD, ICS advisories, DefectDojo).
 *
 * Base path is resolved from OPENCODE_ROOT, defaulting to the parent of the
 * OSIRIS working directory (OSIRIS lives at <opencode>/osiris). Override in
 * .env.local if your layout differs:  OPENCODE_ROOT=/abs/path/to/Opencode
 */
import path from 'node:path';
import { promises as fs } from 'node:fs';

export function opencodeRoot(): string {
  return process.env.OPENCODE_ROOT
    ? path.resolve(process.env.OPENCODE_ROOT)
    : path.resolve(process.cwd(), '..');
}

export const INTEL_PATHS = {
  eurepocCsv: () => path.join(opencodeRoot(), 'threat-intel/eurepoc/eurepoc_global_dataset_1.3.csv'),
  otcadJson: () => path.join(opencodeRoot(), 'threat-intel/otcad/cyberattacks.json'),
  icsAdvMaster: () => path.join(opencodeRoot(), 'threat-intel/ics-advisory-project/ICS-CERT_ADV/CISA_ICS_ADV_Master.csv'),
  reconDir: () => path.join(opencodeRoot(), 'sec-tools/output/recon'),
};

/** Service endpoints from sec-tools/config.json (defaults match that file). */
export const INTEL_SERVICES = {
  defectdojo: process.env.DEFECTDOJO_URL ?? 'http://localhost:8080',
  dtrack: process.env.DTRACK_URL ?? 'http://localhost:8081',
};

export async function readText(file: string): Promise<string | null> {
  try { return await fs.readFile(file, 'utf8'); } catch { return null; }
}

/**
 * Minimal RFC-4180 CSV parser (handles quoted fields with embedded commas,
 * quotes, and newlines). Returns { header, rows } where each row is string[].
 */
export function parseCsv(text: string): { header: string[]; rows: string[][] } {
  const records: string[][] = [];
  let field = '';
  let row: string[] = [];
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      row.push(field); field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.length > 1 || row[0] !== '') records.push(row);
      row = [];
    } else field += c;
  }
  if (field !== '' || row.length) { row.push(field); records.push(row); }
  const header = records.shift() ?? [];
  return { header, rows: records };
}

/** Header → first-occurrence column index (EuRepoC repeats some column names). */
export function indexMap(header: string[]): Record<string, number> {
  const m: Record<string, number> = {};
  header.forEach((h, i) => { const k = h.trim(); if (!(k in m)) m[k] = i; });
  return m;
}
