import assert from "node:assert/strict";
import test from "node:test";
import { affectedDeliveries, type MediaEvent } from "../src/blast_radius.js";

test("reports only creator deliveries made by the leaked key during exposure", () => {
  const events: MediaEvent[] = [
    { timestamp: "2026-09-27T10:02:00.000Z", key_id: "key-leaked", stage: "creator_delivered", asset_id: "asset-1", job_id: "job-1", creator_id: "creator-a" },
    { timestamp: "2026-09-27T10:03:00.000Z", key_id: "key-safe", stage: "creator_delivered", asset_id: "asset-2", job_id: "job-2", creator_id: "creator-b" },
    { timestamp: "2026-09-27T10:04:00.000Z", key_id: "key-leaked", stage: "processing_finished", asset_id: "asset-3", job_id: "job-3" },
    { timestamp: "2026-09-27T10:20:00.000Z", key_id: "key-leaked", stage: "creator_delivered", asset_id: "asset-4", job_id: "job-4", creator_id: "creator-d" }
  ];

  const result = affectedDeliveries(
    events,
    "key-leaked",
    "2026-09-27T10:00:00.000Z",
    "2026-09-27T10:10:00.000Z"
  );

  assert.deepEqual(result.map((event) => event.asset_id), ["asset-1"]);
});
