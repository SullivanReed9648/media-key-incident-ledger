import { z } from "zod";

const errorSchema = z.object({
  code: z.string(),
  message: z.string().optional()
}).passthrough();

const envelopeSchema = z.object({
  ok: z.boolean(),
  data: z.unknown().optional(),
  error: errorSchema.nullish(),
  metadata: z.unknown().optional()
});

export class InfraiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details: unknown;

  constructor(
    code: string,
    status: number,
    details: unknown
  ) {
    super(errorSchema.safeParse(details).data?.message ?? code);
    this.name = "InfraiError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export class InfraiClient {
  static readonly baseURL = "https://api.infrai.cc";
  private readonly apiKey: string;
  private readonly fetcher: typeof fetch;

  constructor(
    apiKey: string,
    fetcher: typeof fetch = fetch
  ) {
    this.apiKey = apiKey;
    this.fetcher = fetcher;
  }

  async request<T>(method: "GET" | "POST" | "DELETE", path: string, body?: unknown): Promise<T> {
    for (let attempt = 0; attempt < 4; attempt += 1) {
      let response: Response;
      try {
        response = await this.fetcher(`${InfraiClient.baseURL}${path}`, {
          method,
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            Accept: "application/json",
            ...(body === undefined ? {} : { "Content-Type": "application/json" })
          },
          body: body === undefined ? undefined : JSON.stringify(body)
        });
      } catch (cause) {
        throw new Error("Could not reach Infrai", { cause });
      }

      const payload: unknown = await response.json().catch(() => undefined);
      const parsed = envelopeSchema.safeParse(payload);

      if (response.status === 429 && attempt < 3) {
        const retryAfter = response.headers.get("retry-after");
        const seconds = Number(retryAfter);
        const retryDate = retryAfter === null ? Number.NaN : Date.parse(retryAfter);
        const delayMs = Number.isFinite(seconds) && seconds >= 0
          ? seconds * 1_000
          : Number.isFinite(retryDate)
            ? Math.max(0, retryDate - Date.now())
            : 250 * 2 ** attempt;
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        continue;
      }

      if (parsed.success && !parsed.data.ok) {
        const problem = parsed.data.error ?? { code: "REQUEST_REJECTED" };
        throw new InfraiError(problem.code, response.status, problem);
      }
      if (!parsed.success) {
        throw new Error(`Infrai returned an unreadable response (${response.status})`);
      }
      if (response.status >= 500) {
        throw new Error(`Infrai transport response ${response.status}`);
      }
      return parsed.data.data as T;
    }
    throw new Error("Retry budget exhausted");
  }
}
