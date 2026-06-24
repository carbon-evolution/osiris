import { describe, it, expect } from 'vitest';
import { epssCollector } from './epss';
import { cveCollector } from './cve';
import { threatfoxCollector } from './threatfox';
import { urlhausCollector } from './urlhaus';
import { malwarebazaarCollector } from './malwarebazaar';

describe('epss normalize', () => {
  it('parses csv rows, skipping comment + header', () => {
    const csv = '#model_version:v2024,score_date:2026\ncve,epss,percentile\nCVE-2024-1,0.97,0.999\nCVE-2024-2,0.01,0.10\n';
    const recs = epssCollector.normalize(csv);
    expect(recs).toHaveLength(2);
    expect(recs[0]).toMatchObject({ uid: 'CVE-2024-1', risk: 97 });
  });
});

describe('cve normalize', () => {
  it('maps NVD vuln + CVSS v3.1 base score to risk', () => {
    const raw = { vulnerabilities: [{ cve: {
      id: 'CVE-2024-9', descriptions: [{ lang: 'en', value: 'test' }],
      metrics: { cvssMetricV31: [{ cvssData: { baseScore: 9.8 } }] },
    }}]};
    const recs = cveCollector.normalize(raw);
    expect(recs[0]).toMatchObject({ uid: 'CVE-2024-9', risk: 98 });
  });
});

describe('threatfox normalize', () => {
  it('maps iocs with confidence as risk', () => {
    const raw = { data: [{ id: 42, ioc: 'evil.com', ioc_type: 'domain', malware_printable: 'Cobalt Strike', confidence_level: 75 }] };
    const recs = threatfoxCollector.normalize(raw);
    expect(recs[0]).toMatchObject({ uid: '42', risk: 75 });
    expect(recs[0].data.ioc).toBe('evil.com');
  });
});

describe('urlhaus normalize', () => {
  it('maps recent urls', () => {
    const raw = { urls: [{ id: 7, url: 'http://bad/x', host: 'bad', threat: 'malware_download', tags: ['elf'] }] };
    const recs = urlhausCollector.normalize(raw);
    expect(recs[0]).toMatchObject({ uid: '7', risk: 90 });
  });
});

describe('malwarebazaar normalize', () => {
  it('maps samples by sha256', () => {
    const raw = { data: [{ sha256_hash: 'abc123', file_type: 'exe', signature: 'Emotet', tags: ['exe'] }] };
    const recs = malwarebazaarCollector.normalize(raw);
    expect(recs[0]).toMatchObject({ uid: 'abc123', risk: 80 });
  });
});
