import { z } from "zod";

export const mediaEventSchema = z.object({
  timestamp: z.string().datetime(),
  key_id: z.string().min(1),
  stage: z.enum(["asset_ingested", "processing_finished", "creator_delivered"]),
  asset_id: z.string().min(1),
  job_id: z.string().min(1),
  creator_id: z.string().min(1).optional()
});

export type MediaEvent = z.infer<typeof mediaEventSchema>;

export function affectedDeliveries(
  events: MediaEvent[],
  keyId: string,
  exposedFrom: string,
  exposedUntil: string
): MediaEvent[] {
  const start = Date.parse(exposedFrom);
  const end = Date.parse(exposedUntil);
  return events.filter((event) => {
    const occurredAt = Date.parse(event.timestamp);
    return event.key_id === keyId
      && event.stage === "creator_delivered"
      && occurredAt >= start
      && occurredAt <= end;
  });
}
