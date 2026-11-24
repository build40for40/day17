import type { ErrorCode, ErrorResponse } from "contract";

export type Handler = (request: Request, env: Env, ctx: ExecutionContext) => Promise<Response>;
export type ScheduledHandler = (controller: ScheduledController, env: Env, ctx: ExecutionContext) => Promise<void>;

export const MAX_JSON_BYTES = 16 * 1024;

export function json<T>(data: T, init: number | ResponseInit = 200): Response {
  return Response.json(data, typeof init === "number" ? { status: init } : init);
}

export function error(code: ErrorCode, status: number, headers?: HeadersInit): Response {
  return Response.json({ error: code } satisfies ErrorResponse, { status, headers });
}

export function noContent(headers?: HeadersInit): Response {
  return new Response(null, { status: 204, headers });
}

export function notImplemented(): Response {
  return error("not_implemented", 501);
}

export type JsonBody = { ok: true; data: unknown } | { ok: false; response: Response };

export async function readJson(request: Request, maxBytes = MAX_JSON_BYTES): Promise<JsonBody> {
  const tooLarge = { ok: false, response: error("payload_too_large", 413) } as const;
  const invalid = { ok: false, response: error("invalid_json", 400) } as const;

  const mediaType = request.headers.get("Content-Type")?.split(";")[0]?.trim().toLowerCase();
  if (mediaType !== "application/json") return { ok: false, response: error("unsupported_media_type", 415) };
  if (Number(request.headers.get("Content-Length") ?? 0) > maxBytes) return tooLarge;
  if (!request.body) return invalid;

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel();
      return tooLarge;
    }
    chunks.push(value);
  }

  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  try {
    return { ok: true, data: JSON.parse(new TextDecoder().decode(bytes)) };
  } catch {
    return invalid;
  }
}
