import type { CreateSignalResponse, OkResponse, SignOffResponse, SolveSignalResponse } from "contract";
import { toSignal } from "../db";
import { error, json, readJson, type Handler, type ScheduledHandler } from "../http";
import { requireSession } from "../session";
import { getProvider } from "../sms/provider";
import { sendAll, type Delivery } from "../sms/send";
import { pruneRateEvents } from "../limits";
import { pruneCodes } from "../verify/store";
import { routeInbound } from "./inbound";
import { signOff } from "./recipients";
import { closeStaleSignals, findOpenSignal, findOwned, raiseSignal, senderName, solveSignal, type Owner, type RaiseError } from "./signals";

const RAISE_ERROR_STATUS: Record<RaiseError, number> = {
  invalid_request: 400,
  signal_too_long: 400,
  too_many_signals: 429,
  rate_limited: 429,
};

export const handleCreateSignal: Handler = async (request, env, ctx) => {
  const body = await readFields(request);
  if (body instanceof Response) return body;
  const owner = await requireOwner(request, env, body.householdId);
  if (owner instanceof Response) return owner;
  const { text } = body;
  if (typeof text !== "string") return error("invalid_request", 400);

  const result = await raiseSignal(env, owner, text, "web");
  if (!result.ok) return error(result.error, RAISE_ERROR_STATUS[result.error]);

  dispatch(env, ctx, result.deliveries);
  return json({ signal: toSignal(result.signal) } satisfies CreateSignalResponse, result.action === "opened" ? 201 : 200);
};

export const handleSolveSignal: Handler = async (request, env, ctx) => {
  const body = request.body ? await readFields(request) : {};
  if (body instanceof Response) return body;
  const owner = await requireOwner(request, env, body.householdId);
  if (owner instanceof Response) return owner;

  const result = await solveSignal(env, owner);
  if (!result.ok) return error(result.error, 409);

  dispatch(env, ctx, result.deliveries);
  return json({ signal: toSignal(result.signal) } satisfies SolveSignalResponse);
};

export const handleSignOff: Handler = async (request, env, ctx) => {
  const body = await readFields(request);
  if (body instanceof Response) return body;
  const owner = await requireOwner(request, env, body.householdId);
  if (owner instanceof Response) return owner;
  const { personId } = body;
  if (typeof personId !== "string") return error("invalid_request", 400);

  const signal = await findOpenSignal(env, owner.household.id);
  if (!signal) return error("no_open_signal", 409);

  const result = await signOff(env, signal, senderName(owner), { personId });
  if (!result.ok) return error(result.error, 409);

  dispatch(env, ctx, result.deliveries);
  return json({ signal: toSignal(result.signal) } satisfies SignOffResponse);
};

export const handleInboundSms: Handler = async (request, env, ctx) => {
  const sms = await getProvider(env).verifyAndParseInbound(request);
  if (!sms) return error("forbidden", 403);

  const { deliveries } = await routeInbound(env, sms);
  dispatch(env, ctx, deliveries);
  return json({ ok: true } satisfies OkResponse);
};

export const handleScheduled: ScheduledHandler = async (_controller, env) => {
  const [closed] = await Promise.all([closeStaleSignals(env), pruneCodes(env.DB), pruneRateEvents(env.DB)]);
  if (closed > 0) console.log(`Closed ${closed} stale signal(s)`);
};

async function readFields(request: Request): Promise<Record<string, unknown> | Response> {
  const body = await readJson(request);
  if (!body.ok) return body.response;
  return typeof body.data === "object" && body.data !== null ? (body.data as Record<string, unknown>) : {};
}

async function requireOwner(request: Request, env: Env, householdId: unknown): Promise<Owner | Response> {
  const session = await requireSession(request, env);
  if (session instanceof Response) return session;

  const { person, households } = await findOwned(env, session.personId);
  if (!person) return error("unauthorized", 401);
  if (households.length === 0) return error("no_household", 403);
  if (householdId === undefined) return households.length === 1 ? { person, household: households[0]! } : error("invalid_request", 400);

  const household = households.find((owned) => owned.id === householdId);
  return household ? { person, household } : error("no_household", 403);
}

function dispatch(env: Env, ctx: ExecutionContext, deliveries: Delivery[]): void {
  if (deliveries.length === 0) return;
  ctx.waitUntil(sendAll(env, deliveries).catch((cause) => console.error("Recording SMS deliveries failed", cause)));
}
