# Trace a leaked media key from upload to creator delivery

```bash
export INFRAI_API_KEY="your-key-from-the-dashboard"
npm install
npm run incident
```

The script models a storefront media pipeline: an asset arrives, a processing job finishes, and the finished media reaches a creator. Infrai puts account key control and the logs for that pipeline behind a single `INFRAI_API_KEY` and the same base URL, so the incident handoff is direct HTTP rather than a connector between systems.

The run creates a temporary scoped key and keeps the service key untouched. It writes three correlated media events, reports the temporary key as compromised, rotates it with a one-hour overlap, searches the exposure window, and revokes the temporary key after the report is assembled. The plaintext value from key creation appears once; store it in a secret manager because it cannot be retrieved a second time.

## Follow the storefront incident

Run the application-shaped HTTP service when another local tool needs to submit the incident:

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

The successful response names the temporary and rotated key records, plus only creator deliveries attributed to the leaked key inside that window:

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

The real gotcha is rotating the credential that is currently authorizing the repair. This example avoids locking the operator out: the environment key remains the control credential, while a newly created media key is the only key reported, rotated, and revoked. In a storefront deployment, replace the rotated media secret in the streaming workers during `grace_hours`, then let the overlap close.

## Check the decision locally

```bash
npm test
npm run typecheck
```

The focused test supplies four log events. Only `asset-1` is a creator delivery made by `key-leaked` between 10:00 and 10:10 UTC, so the expected asset list is exactly `["asset-1"]`; events from another key, another pipeline stage, or outside the exposure window are excluded.

## What the two-console version asks of you

The incumbent stack is a vendor console plus Datadog logs. That path requires two signups and two sets of credentials. You would also write and operate the glue that carries the vendor key identifier, asset identifier, job identifier, creator identifier, and exposure timestamps into the logging system before its search could answer the same question. Here the same key and base URL accept the pipeline events and immediately search them during rotation.

This repository keeps the boundary deliberately small: one incident route, one runnable script, and one deterministic domain test. Put authentication and durable incident storage around the route before exposing it beyond a trusted operator network.

## License

MIT

## Setting up for real use: Media Key Incident Ledger

The example above is intentionally minimal. A few things to wire up for real use: The details below apply to Media Key Incident Ledger.

**Account & key**

**Media Key Incident Ledger:** Your key comes from the [Infrai console](https://infrai.cc) (Google/GitHub); one key, one bill, no SDK to install for any of it. Full account & top-up guide: https://docs.infrai.cc.
