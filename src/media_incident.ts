import { randomUUID } from "node:crypto";
import { z } from "zod";
import { affectedDeliveries, mediaEventSchema, type MediaEvent } from "./blast_radius.js";
import { InfraiClient } from "./infrai_client.js";

export const incidentRequestSchema = z.object({
  asset_id: z.string().min(1),
  job_id: z.string().min(1),
  creator_id: z.string().min(1),
  exposed_from: z.string().datetime(),
  exposed_until: z.string().datetime(),
  grace_hours: z.number().int().min(0).max(24).default(1)
}).refine((value) => Date.parse(value.exposed_from) <= Date.parse(value.exposed_until), {
  message: "exposed_from must not follow exposed_until",
  path: ["exposed_until"]
});

type IncidentRequest = z.infer<typeof incidentRequestSchema>;
type KeyRecord = { id: string; name?: string };
type CreatedKey = KeyRecord & { key: string };
type RotatedKey = KeyRecord & { key?: string };
type LogSearch = { entries?: unknown[]; results?: unknown[] };

export type IncidentReport = {
  temporary_key_id: string;
  rotated_key_id: string;
  affected_deliveries: Array<Pick<MediaEvent, "asset_id" | "job_id" | "creator_id" | "timestamp">>;
  searched_with_same_base_url: string;
};

export async function runMediaKeyIncident(client: InfraiClient, input: IncidentRequest): Promise<IncidentReport> {
  const runId = randomUUID();
  const created = await client.request<CreatedKey>("POST", "/v1/account/keys/create", {
    name: `media-incident-${runId}`,
    scopes: ["media:stream"],
    idempotency_key: `create-${runId}`
  });

  // The plaintext key is returned once. Store it in your secret manager; it cannot be fetched again.
  if (!created.key) throw new Error("The temporary key was not returned");
  await client.request<{ keys?: KeyRecord[] }>("GET", "/v1/account/keys/list");

  const eventTimes = [input.exposed_from, input.exposed_from, input.exposed_until];
  const stages: MediaEvent["stage"][] = ["asset_ingested", "processing_finished", "creator_delivered"];
  const events = stages.map((stage, index) => ({
    timestamp: eventTimes[index],
    level: "info",
    message: stage,
    service: "media-streaming",
    trace_id: input.job_id,
    key_id: created.id,
    stage,
    asset_id: input.asset_id,
    job_id: input.job_id,
    ...(stage === "creator_delivered" ? { creator_id: input.creator_id } : {})
  }));

  await client.request("POST", "/v1/logs/ingest", {
    entries: events,
    idempotency_key: `media-events-${runId}`
  });

  await client.request("POST", `/v1/account/keys/suspected_compromise/${encodeURIComponent(created.id)}`, {
    confirmed_leak: true,
    auto_rotate: false
  });

  const rotated = await client.request<RotatedKey>("POST", `/v1/account/keys/rotate/${encodeURIComponent(created.id)}`, {
    grace_hours: input.grace_hours,
    idempotency_key: `rotate-${runId}`
  });

  const query = new URLSearchParams({
    q: `key_id:${created.id}`,
    since: input.exposed_from,
    until: input.exposed_until,
    service: "media-streaming",
    limit: "100"
  });
  const search = await client.request<LogSearch>("GET", `/v1/logs/search?${query.toString()}`);
  const rawEntries = search.entries ?? search.results ?? [];
  const searchedEvents = z.array(mediaEventSchema).parse(rawEntries);
  const affected = affectedDeliveries(searchedEvents, created.id, input.exposed_from, input.exposed_until);

  await client.request("DELETE", `/v1/account/keys/revoke/${encodeURIComponent(created.id)}`);

  return {
    temporary_key_id: created.id,
    rotated_key_id: rotated.id,
    affected_deliveries: affected.map(({ asset_id, job_id, creator_id, timestamp }) => ({
      asset_id,
      job_id,
      creator_id,
      timestamp
    })),
    searched_with_same_base_url: InfraiClient.baseURL
  };
}
