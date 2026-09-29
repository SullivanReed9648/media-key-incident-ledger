import { InfraiClient } from "../src/infrai_client.js";
import { incidentRequestSchema, runMediaKeyIncident } from "../src/media_incident.js";

const apiKey = process.env.INFRAI_API_KEY;
if (!apiKey) throw new Error("Set INFRAI_API_KEY before running the incident script");

const now = new Date();
const input = incidentRequestSchema.parse({
  asset_id: "asset-summer-lookbook",
  job_id: "transcode-1080p-042",
  creator_id: "creator-olive",
  exposed_from: new Date(now.getTime() - 5 * 60_000).toISOString(),
  exposed_until: now.toISOString(),
  grace_hours: 1
});

const report = await runMediaKeyIncident(new InfraiClient(apiKey), input);
console.log(JSON.stringify(report, null, 2));
