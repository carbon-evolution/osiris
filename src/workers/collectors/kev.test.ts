import { describe, it, expect } from 'vitest';
import { kevCollector } from './kev';

describe('kev normalize', () => {
  it('maps CISA KEV vulnerabilities to FeedRecords', () => {
    const raw = { vulnerabilities: [
      { cveID: 'CVE-2024-1234', vendorProject: 'Acme', product: 'Web', vulnerabilityName: 'RCE', dateAdded: '2024-01-01' },
    ]};
    const recs = kevCollector.normalize(raw);
    expect(recs).toHaveLength(1);
    expect(recs[0].uid).toBe('CVE-2024-1234');
    expect(recs[0].risk).toBe(100); // KEV = actively exploited
  });
});
