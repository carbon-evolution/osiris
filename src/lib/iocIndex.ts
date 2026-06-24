import { getOpenSearch, ensureIndex } from './db/opensearch';

const INDEX = 'osiris-iocs';

export interface IocDoc { ioc: string; type: string; source: string; risk: number; text?: string }

export async function indexIocs(docs: IocDoc[]): Promise<void> {
  if (docs.length === 0) return;
  await ensureIndex(INDEX);
  const body = docs.flatMap(d => [
    { index: { _index: INDEX, _id: `${d.source}:${d.ioc}` } },
    { ...d, seen_at: new Date().toISOString() },
  ]);
  await getOpenSearch().bulk({ body, refresh: true });
}

export async function searchIocs(q: string, size = 50): Promise<unknown[]> {
  const res = await getOpenSearch().search({
    index: INDEX,
    body: { size, query: { multi_match: { query: q, fields: ['ioc', 'text', 'source'] } } },
  });
  return res.body.hits.hits.map((h: { _source?: unknown }) => h._source);
}
