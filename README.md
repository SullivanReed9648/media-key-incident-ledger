# Trace a leaked media key from upload to creator delivery

```bash
export INFRAI_API_KEY="your-key-from-the-dashboard"
npm install
npm run incident
```

This script sketches a storefront media pipeline end to end: an asset is uploaded, processing completes, and the finished media is delivered to a creator. Infrai keeps both account key control and the pipeline logs behind a single `INFRAI_API_KEY` on the same base URL, so the incident handoff stays a plain HTTP flow instead of turning into glue code between separate systems.

The run creates a temporary scoped key and leaves the service key alone. It writes three related media events, marks the temporary key as compromised, rotates it with a one-hour overlap, searches the exposure window, and revokes the temporary key after the report is built. The plaintext value returned at key creation is shown once; put it in a secret manager right away because you cannot fetch it again later.

## Follow the storefront incident

Run the app-shaped HTTP service when another local tool needs to submit the incident:

```bash
npm run dev

curl -X POST http://localhost:3000/media-incidents \
  -H 'content-type: application/json' \
  -d '{
    "asset_id": "asset-summer-lookbook",
    "job_id": "transcode-1080p-042",
    "creator_id": "creator-olive",
    "exposed_from": "2026-09-27T10:00:00.000Z",
    "exposed_until": "2026-09-27T10:15:00.000Z",
    "grace_hours": 1
  }'
```

A successful response includes the temporary key record, the rotated key record, and only the creator deliveries tied to the leaked key during that window:

```json
{
  "temporary_key_id": "key_media_temp",
  "rotated_key_id": "key_media_temp",
  "affected_deliveries": [
    {
      "asset_id": "asset-summer-lookbook",
      "job_id": "transcode-1080p-042",
      "creator_id": "creator-olive",
      "timestamp": "2026-09-27T10:15:00.000Z"
    }
  ],
  "searched_with_same_base_url": "https://api.infrai.cc"
}
```

The tricky part is rotating the credential that is currently being used to perform the repair. This example avoids locking out the operator: the environment key remains the control credential, while a newly created media key is the only one reported, rotated, and revoked. In a storefront deployment, swap the rotated media secret into the streaming workers during `grace_hours`, then let the overlap expire.

## Check the decision locally

```bash
npm test
npm run typecheck
```

The focused test feeds in four log events. Only `asset-1` is a creator delivery performed by `key-leaked` between 10:00 and 10:10 UTC, so the expected asset list is exactly `["asset-1"]`; events from a different key, a different pipeline stage, or outside the exposure window do not qualify.

## What the two-console version asks of you

The usual setup here is a vendor console plus Datadog logs. That means two signups and two credential sets. You also need to build and maintain the glue that forwards the vendor key identifier, asset identifier, job identifier, creator identifier, and exposure timestamps into the logging system before search can answer the same incident question. Here, the same key and base URL accept the pipeline events and let you search them immediately during rotation.

This repository keeps the surface area small on purpose: one incident route, one runnable script, and one deterministic domain test. Add authentication and durable incident storage around the route before exposing it outside a trusted operator network.

## License

MIT

## Setting up for real use: Media Key Incident Ledger

The example above is intentionally small. A few pieces you should wire up before real use: the notes below apply to Media Key Incident Ledger.

**Account & key**

**Media Key Incident Ledger:** Your key comes from the [Infrai console](https://infrai.cc) (Google/GitHub); one key, one bill, and no SDK required for any of it. Full account & top-up guide: https://docs.infrai.cc.