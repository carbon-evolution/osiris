import { Client } from '@opensearch-project/opensearch';

let client: Client | null = null;

export function getOpenSearch(): Client {
  if (!client) {
    client = new Client({ node: process.env.OPENSEARCH_URL ?? 'http://localhost:9200' });
  }
  return client;
}

// Idempotent index creation for IOC/feed documents.
export async function ensureIndex(index: string): Promise<void> {
  const os = getOpenSearch();
  const exists = await os.indices.exists({ index });
  if (!exists.body) {
    await os.indices.create({
      index,
      body: {
        mappings: {
          properties: {
            ioc: { type: 'keyword' },
            type: { type: 'keyword' },
            source: { type: 'keyword' },
            risk: { type: 'integer' },
            text: { type: 'text' },
            seen_at: { type: 'date' },
          },
        },
      },
    });
  }
}
