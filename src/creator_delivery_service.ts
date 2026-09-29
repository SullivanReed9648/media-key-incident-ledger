import { createServer } from "node:http";
import { ZodError } from "zod";
import { InfraiClient, InfraiError } from "./infrai_client.js";
import { incidentRequestSchema, runMediaKeyIncident } from "./media_incident.js";

const apiKey = process.env.INFRAI_API_KEY;
if (!apiKey) throw new Error("Set INFRAI_API_KEY before starting the service");

const client = new InfraiClient(apiKey);
const port = Number(process.env.PORT ?? 3000);

async function readJson(request: import("node:http").IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function respond(response: import("node:http").ServerResponse, status: number, value: unknown): void {
  response.writeHead(status, { "Content-Type": "application/json" });
  response.end(JSON.stringify(value));
}

createServer(async (request, response) => {
  if (request.method !== "POST" || request.url !== "/media-incidents") {
    respond(response, 404, { error: "Route not found" });
    return;
  }

  try {
    const input = incidentRequestSchema.parse(await readJson(request));
    respond(response, 200, await runMediaKeyIncident(client, input));
  } catch (error) {
    if (error instanceof ZodError) {
      respond(response, 400, { error: "Invalid incident request", issues: error.issues });
      return;
    }
    if (error instanceof InfraiError) {
      const status = error.status >= 400 && error.status < 500 ? error.status : 502;
      respond(response, status, { error: error.code, details: error.details });
      return;
    }
    respond(response, 502, { error: "Incident workflow did not complete" });
  }
}).listen(port, () => {
  console.log(`Creator delivery incident service listening on http://localhost:${port}`);
});
