# Goal Description
Build an Entity Graph intelligence layer ("Palantir-style ontology") that links disparate map entities (aircraft, vessels, organizations, people) across feeds, but do so using a **100% Open-Source and Self-Hosted Architecture**. 

Instead of relying on third-party SaaS APIs that have rate limits or require paid keys, we will spin up local intelligence containers that hold bulk data, and aggressively cache external queries using your existing Nginx infrastructure.

## User Review Required
> [!IMPORTANT]
> **Storage & Compute Requirements:**
> Self-hosting intelligence data requires some storage on your Ionos/Epyc server.
> - The **Yente** container (OpenSanctions self-hosted API) downloads about ~1.5GB of global sanctions, PEPs, and corporate data.
> - Are you comfortable dedicating a couple of gigabytes of storage on the server for these self-hosted datasets?

## Open Questions
> [!WARNING]
> 1. Do you want the Entity Graph panel to replace the existing OSINT panel when an entity is clicked, or should they be separate tabs/panels?
> 2. We already have an `osiris-cache` Nginx container. I plan to modify this Nginx configuration to also cache our outgoing intelligence queries (e.g. Wikidata). Does this align with your vision for the "Self Hosted intelligence sector that also gets caches"?

## Proposed Changes

---

### Backend / Infrastructure (Self-Hosted Intelligence Sector)

#### [MODIFY] [docker-compose.yml](file:///c:/Users/mrads/.gemini/antigravity/playground/osiris/docker-compose.yml)
- **Add Yente Service:** Add `ghcr.io/opensanctions/yente:latest`. Yente is the official open-source, self-hosted API engine for OpenSanctions. It automatically downloads the latest global sanctions and corporate data and serves it locally, meaning we have **zero rate limits** and no external tracking.
- **Connect Network:** Ensure Next.js can communicate internally with Yente on `http://yente:8000`.

#### [MODIFY] [nginx/nginx.conf](file:///c:/Users/mrads/.gemini/antigravity/playground/osiris/nginx/nginx.conf)
- **Add OSINT Cache Layer:** Configure the existing Nginx container to act as an aggressive forward-cache proxy for external OSINT queries (like Wikidata SPARQL or public ICAO registries). When an entity is queried once, Nginx will cache the ontology data locally so subsequent expansions are instant and don't hit external rate limits.

#### [NEW] [route.ts](file:///c:/Users/mrads/.gemini/antigravity/playground/osiris/src/app/api/entity/expand/route.ts)
- Create the ontology resolver endpoint inside Next.js.
- **Resolver Logic (Fully Local):**
  - Next.js receives a request to expand an entity (e.g., an IMO number or Company name).
  - It queries the **local Yente container** to instantly find corporate linkages, executives, and sanction flags.
  - It queries external open sources (Wikidata) routed *through* the **local Nginx cache**.
  - It formats the results into a `{ nodes, links }` graph object and sends it to the frontend.

---

### Frontend UI

#### [NEW] [EntityGraphPanel.tsx](file:///c:/Users/mrads/.gemini/antigravity/playground/osiris/src/components/EntityGraphPanel.tsx)
- Create a new sliding side-panel for the UI.
- Integrate `react-force-graph-2d` (which uses `d3-force` internally and is already in `package.json`) to render a dynamic, force-directed mini-graph of nodes and links.
- Clicking a node in the graph triggers a recursive fetch to the local `/api/entity/expand` endpoint to branch out the ontology.

#### [MODIFY] [page.tsx](file:///c:/Users/mrads/.gemini/antigravity/playground/osiris/src/app/page.tsx)
- Add state for `activeEntityGraph` (node data and links).
- Update the `handleEntityClick` callback to set the `activeEntity` and open the `EntityGraphPanel`.

#### [MODIFY] [OsirisMap.tsx](file:///c:/Users/mrads/.gemini/antigravity/playground/osiris/src/components/OsirisMap.tsx)
- Ensure all clickable layers pass a structured object to `onEntityClick` containing `{ type: 'aircraft', id: 'callsign/tail' }` or `{ type: 'vessel', id: 'IMO' }`.

## Verification Plan

### Manual Verification
1. `docker-compose up -d` to verify the new Yente container spins up and begins downloading the sanctions index.
2. Click a commercial flight or maritime vessel on `localhost:3000`.
3. Verify the `EntityGraphPanel` slides open on the right side.
4. Verify the force-directed graph automatically expands by querying the local `/api/entity/expand` route.
5. Inspect the Docker logs to confirm that the API queries are hitting the local Yente container and the Nginx cache rather than external APIs directly.
