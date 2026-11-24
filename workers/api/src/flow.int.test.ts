import { createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { API_BASE, type CreateHouseholdResponse, type MeResponse, type Signal } from "contract";
import { beforeAll, describe, expect, it } from "vitest";
import { clearDatabase } from "../test/db";
import worker from "./index";
import { SESSION_COOKIE } from "./session";
import { clearFakeOutbox, fakeOutbox } from "./sms/fake";
import { allClear, welcome } from "./sms/texts";

const PARENT = "+447700900300";
const GRAN = "+447700900301";
const THEO = "+447700900302";
const CAMILLE = "+447700900303";

let cookie = "";

async function call(method: string, path: string, body?: unknown): Promise<Response> {
  const ctx = createExecutionContext();
  const request = new Request<unknown, IncomingRequestCfProperties>(`https://build40for40.com${API_BASE}${path}`, {
    method,
    headers: { "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const response = await worker.fetch(request, env, ctx);
  await waitOnExecutionContext(ctx);
  return response;
}

let providerCount = 0;
const text = (from: string, body: string) => call("POST", "/sms/inbound", { from, body, providerId: `flow-${++providerCount}` });

function drain(): { to: string; body: string }[] {
  const sent = fakeOutbox().map(({ to, body }) => ({ to, body }));
  clearFakeOutbox();
  return sent.sort((a, b) => a.to.localeCompare(b.to));
}

const to = (phones: string[], body: string) => phones.map((phone) => ({ to: phone, body }));

describe("the bat signal, end to end with the fake provider", () => {
  beforeAll(async () => {
    await clearDatabase();
    clearFakeOutbox();
  });

  it("signs the parent in with a code sent by SMS", async () => {
    expect((await call("POST", "/verify/start", { phone: "07700 900300" })).status).toBe(200);

    const [codeText, ...rest] = drain();
    expect(rest).toEqual([]);
    expect(codeText?.to).toBe(PARENT);
    const code = codeText!.body.match(/\b\d{6}\b/)![0];
    expect(await env.DB.prepare("SELECT count(*) AS n FROM messages").first("n")).toBe(0);

    const checked = await call("POST", "/verify/check", { phone: PARENT, code });
    expect(checked.status).toBe(200);
    cookie = checked.headers.get("Set-Cookie")!.split(";")[0]!;
    expect(cookie.startsWith(`${SESSION_COOKIE}=`)).toBe(true);

    const me = (await (await call("GET", "/me")).json()) as MeResponse;
    expect(me).toMatchObject({ person: { phone: PARENT }, household: null, openSignal: null, signalNumber: null });
  });

  it("creates a household with three helpers and welcomes each of them", async () => {
    const response = await call("POST", "/households", {
      parentName: "Anastasia",
      householdName: "The Martins",
      helpers: [
        { name: "Grandma", phone: GRAN },
        { name: "Theo", phone: THEO },
        { name: "Camille", phone: CAMILLE },
      ],
    });
    expect(response.status).toBe(201);
    const { household } = (await response.json()) as CreateHouseholdResponse;
    expect(household.helpers.map(({ phone }) => phone).sort()).toEqual([GRAN, THEO, CAMILLE]);
    expect(drain()).toEqual(to([GRAN, THEO, CAMILLE], welcome("Anastasia", "The Martins")));
  });

  it("runs a signal over SMS: broadcast, relay, STOP, update and solve", async () => {
    expect((await text(PARENT, "Can anyone grab Leo from school at 5?")).status).toBe(200);
    expect(drain()).toEqual(to([GRAN, THEO, CAMILLE], "Anastasia: Can anyone grab Leo from school at 5?"));
    const me = (await (await call("GET", "/me")).json()) as MeResponse;
    expect(me.openSignal).toMatchObject({ text: "Can anyone grab Leo from school at 5?", source: "sms", status: "open" });

    await text(GRAN, "On my way, 10 min");
    expect(drain()).toEqual([{ to: PARENT, body: "Grandma: On my way, 10 min" }]);

    await text(THEO, "STOP");
    expect(drain()).toEqual([]);

    await text(PARENT, "Gran has it, thanks all");
    expect(drain()).toEqual(to([GRAN, CAMILLE], "Anastasia: Gran has it, thanks all"));

    await text(PARENT, " Résolu ");
    expect(drain()).toEqual(to([GRAN, CAMILLE], allClear("Anastasia")));
    expect(((await (await call("GET", "/me")).json()) as MeResponse).openSignal).toBeNull();
  });

  it("runs the same signal from the red button", async () => {
    const opened = await call("POST", "/signals", { text: "No nappies left, anyone near Tesco?" });
    expect(opened.status).toBe(201);
    const { signal } = (await opened.json()) as { signal: Signal };
    expect(signal).toMatchObject({ source: "web", status: "open" });
    expect(drain()).toEqual(to([GRAN, CAMILLE], "Anastasia: No nappies left, anyone near Tesco?"));

    const updated = await call("POST", "/signals", { text: "Size 4 please" });
    expect(updated.status).toBe(200);
    expect(((await updated.json()) as { signal: Signal }).signal.id).toBe(signal.id);
    expect(drain()).toEqual(to([GRAN, CAMILLE], "Anastasia: Size 4 please"));

    await text(CAMILLE, "Grabbing some now");
    expect(drain()).toEqual([{ to: PARENT, body: "Camille: Grabbing some now" }]);

    const solved = await call("POST", "/signals/solve");
    expect(solved.status).toBe(200);
    expect(((await solved.json()) as { signal: Signal }).signal).toMatchObject({ id: signal.id, status: "solved" });
    expect(drain()).toEqual(to([GRAN, CAMILLE], allClear("Anastasia")));
  });

  it("recorded every outbound text with its outcome", async () => {
    const { results } = await env.DB.prepare("SELECT kind, count(*) AS n FROM messages WHERE direction = 'out' GROUP BY kind ORDER BY kind").all();
    expect(results).toEqual([
      { kind: "all_clear", n: 4 },
      { kind: "relay", n: 2 },
      { kind: "signal", n: 5 },
      { kind: "update", n: 4 },
      { kind: "welcome", n: 3 },
    ]);
    expect(await env.DB.prepare("SELECT count(*) AS n FROM messages WHERE status = 'failed'").first("n")).toBe(0);
  });
});
