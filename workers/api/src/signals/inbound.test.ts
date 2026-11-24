import { env } from "cloudflare:workers";
import { MAX_SIGNAL_LENGTH, MAX_SIGNALS_PER_DAY } from "contract";
import { MAX_BROADCASTS_PER_DAY } from "../limits";
import { beforeEach, describe, expect, it } from "vitest";
import { clearDatabase } from "../../test/db";
import { isoAgo, type MessageRow, type PersonRow, type SignalRow } from "../db";
import { clearFakeOutbox, FAKE_FAILING_NUMBER, fakeOutbox } from "../sms/fake";
import { sendAll } from "../sms/send";
import {
  acceptReceived,
  allClear,
  checkingReceived,
  codePrompt,
  droppedOut,
  helperAccepted,
  helperChecking,
  helperRejected,
  nothingOpen,
  rejectReceived,
  signalTooLong,
  signalWithCodes,
  signOffHelp,
  signupLink,
  standby,
  standDown,
  stillNeeded,
  tooManySignals,
  tooManyTexts,
  updateWithCodes,
  youAreOn,
} from "../sms/texts";
import { anastasia, camille, grandma, insertSignal, outboundMessages, seedHousehold, signalsOf, stranger, theo } from "./fixtures";
import { decideRoute, routeInbound, type SenderContext } from "./inbound";

const person: PersonRow = { id: "p1", phone: "+447700900200", name: "Sam", opted_out_at: null, created_at: "" };
const household = { id: "h1", name: "The Martins", created_at: "" };
const signal: SignalRow = { id: "s1", household_id: "h1", text: "Pickup", source: "sms", status: "open", opened_at: "", solved_at: null, signed_off_person_id: null };

const unknown: SenderContext = {
  person: null,
  owned: null,
  ownedOpenSignal: null,
  helpedOpenSignal: null,
  helperName: null,
  helpedHouseholdId: null,
  signupLinkSent: false,
  alerts: [],
  promptedRecently: false,
};
const parent: SenderContext = { ...unknown, person, owned: { person, household } };
const helper: SenderContext = { ...unknown, person, helpedHouseholdId: "h2" };

describe("decideRoute", () => {
  it.each([
    ["a parent with nothing open opens a signal", parent, "Pickup at 5?", { kind: "open" }],
    ["a parent with a signal open sends an update", { ...parent, ownedOpenSignal: signal }, "Running late", { kind: "update" }],
    ["a parent with a signal open can solve it", { ...parent, ownedOpenSignal: signal }, " résolu ", { kind: "solve" }],
    ["a parent with nothing open can't solve anything", parent, "SOLVED", { kind: "ignore", reason: "nothing_to_solve" }],
    ["a helper with a signal open relays to its parent", { ...helper, helpedOpenSignal: signal }, "On my way", { kind: "relay", signal }],
    ["a helper with nothing open hears so", helper, "Need anything?", { kind: "nothing_open" }],
    ["anyone can STOP", { ...parent, ownedOpenSignal: signal }, "stop", { kind: "stop" }],
    ["an unknown number can STOP", unknown, "STOP", { kind: "stop" }],
    ["an unknown number gets the sign up link", unknown, "hello?", { kind: "signup_link" }],
    ["an unknown number gets it once", { ...unknown, signupLinkSent: true }, "hello?", { kind: "ignore", reason: "signup_link_already_sent" }],
    ["a signed in person with no household is unknown", { ...unknown, person }, "hello?", { kind: "signup_link" }],
    ["an empty text is ignored", helper, "  ", { kind: "ignore", reason: "empty" }],
    ["a parent helping elsewhere opens their own signal while theirs is quiet", { ...parent, helpedHouseholdId: "h2", helpedOpenSignal: signal }, "Coming", { kind: "open" }],
    [
      "a parent's own open signal wins over one they help",
      { ...parent, ownedOpenSignal: signal, helpedHouseholdId: "h2", helpedOpenSignal: { ...signal, id: "s2" } },
      "Coming",
      { kind: "update" },
    ],
  ] as const)("%s", (_name, context, body, route) => {
    expect(decideRoute(context, body)).toEqual(route);
  });
});

describe("routeInbound", () => {
  let providerCount = 0;

  async function text(from: string, body: string, providerId = `test-${++providerCount}`) {
    const result = await routeInbound(env, { from, body, providerId });
    await sendAll(env, result.deliveries);
    return result.outcome;
  }

  const sent = () => fakeOutbox().map(({ to, body }) => ({ to, body }));

  beforeEach(async () => {
    await clearDatabase();
    clearFakeOutbox();
    await seedHousehold("h1", "The Martins", anastasia, [grandma, theo, { ...camille, optedOut: true }]);
  });

  it("opens a signal from the parent and broadcasts it, skipping opted out helpers", async () => {
    const outcome = await text(anastasia.phone, "Can anyone grab Leo at 5?");

    const [opened] = await signalsOf("h1");
    expect(outcome).toEqual({ action: "opened", signalId: opened?.id });
    expect(opened).toMatchObject({ text: "Can anyone grab Leo at 5?", source: "sms", status: "open" });
    expect(sent()).toEqual([
      { to: grandma.phone, body: signalWithCodes("Anastasia", "Can anyone grab Leo at 5?", 1) },
      { to: theo.phone, body: signalWithCodes("Anastasia", "Can anyone grab Leo at 5?", 1) },
    ]);

    const inbound = await env.DB.prepare("SELECT * FROM messages WHERE direction = 'in'").first<MessageRow>();
    expect(inbound).toMatchObject({ household_id: "h1", signal_id: opened?.id, person_id: anastasia.id, kind: "inbound", status: "received" });
    expect((await outboundMessages()).map(({ kind, status, signal_id }) => ({ kind, status, signal_id }))).toEqual([
      { kind: "signal", status: "sent", signal_id: opened?.id },
      { kind: "signal", status: "sent", signal_id: opened?.id },
    ]);
  });

  it("broadcasts a second text from the parent as an update", async () => {
    await text(anastasia.phone, "Pickup at 5");
    clearFakeOutbox();
    const outcome = await text(anastasia.phone, "Actually 5:30");

    expect(outcome).toMatchObject({ action: "updated" });
    expect(await signalsOf("h1")).toHaveLength(1);
    expect(sent()).toEqual([
      { to: grandma.phone, body: updateWithCodes("Anastasia", "Actually 5:30", 1) },
      { to: theo.phone, body: updateWithCodes("Anastasia", "Actually 5:30", 1) },
    ]);
  });

  it.each(["SOLVED", "solved", " Résolu ", "RESOLU", "résolu!"])("closes the signal when the parent texts %j", async (body) => {
    await text(anastasia.phone, "Pickup at 5");
    clearFakeOutbox();

    expect(await text(anastasia.phone, body)).toMatchObject({ action: "solved" });
    expect(await signalsOf("h1")).toMatchObject([{ status: "solved" }]);
    expect(sent()).toEqual([
      { to: grandma.phone, body: allClear("Anastasia") },
      { to: theo.phone, body: allClear("Anastasia") },
    ]);
  });

  it("relays a helper's reply to the parent only", async () => {
    await text(anastasia.phone, "Pickup at 5");
    clearFakeOutbox();

    expect(await text(grandma.phone, "I can do it, leaving now")).toMatchObject({ action: "relayed", householdId: "h1" });
    expect(sent()).toEqual([{ to: anastasia.phone, body: "Grandma: I can do it, leaving now" }]);
  });

  it("relays to the most recently opened signal when a helper helps two households, under the name that parent gave them", async () => {
    const zoe = { id: "p-zoe", phone: "+447700900104", name: "Zoe" };
    await seedHousehold("h2", "The Duponts", zoe, [{ ...grandma, name: "Mamie" }]);
    await insertSignal("h1", isoAgo(60_000));
    const newer = await insertSignal("h2", isoAgo(1_000));

    expect(await text(grandma.phone, "Which one?")).toEqual({ action: "relayed", signalId: newer, householdId: "h2" });
    expect(sent()).toEqual([{ to: zoe.phone, body: "Mamie: Which one?" }]);
  });

  describe("reply codes and states", () => {
    const zoe = { id: "p-zoe", phone: "+447700900104", name: "Zoe" };

    const stateOf = async (personId: string) =>
      (await env.DB.prepare("SELECT state FROM signal_recipients WHERE person_id = ? ORDER BY code").bind(personId).all<{ state: string }>()).results.map(
        ({ state }) => state,
      );
    const signedOff = async (householdId: string) =>
      (await env.DB.prepare("SELECT signed_off_person_id AS id FROM signals WHERE household_id = ? AND status = 'open'").bind(householdId).first<{ id: string | null }>())
        ?.id;

    async function raise(from = anastasia.phone, body = "Pickup at 5") {
      await text(from, body);
      clearFakeOutbox();
    }

    it("starts every helper as not read", async () => {
      await raise();
      expect(await stateOf(grandma.id)).toEqual(["not_read"]);
      expect(await stateOf(theo.id)).toEqual(["not_read"]);
      expect(await stateOf(camille.id)).toEqual([]);
    });

    it("moves a helper through checking, accept and reject, telling the parent each time", async () => {
      await raise();

      expect(await text(grandma.phone, "C1 let me ask Grandpa")).toMatchObject({ action: "replied", state: "pending" });
      expect(sent()).toEqual([
        { to: grandma.phone, body: checkingReceived("Anastasia", 1) },
        { to: anastasia.phone, body: helperChecking("Grandma", "let me ask Grandpa") },
      ]);

      clearFakeOutbox();
      expect(await text(grandma.phone, "y1")).toMatchObject({ action: "replied", state: "accepted" });
      expect(sent()).toEqual([
        { to: grandma.phone, body: acceptReceived("Anastasia") },
        { to: anastasia.phone, body: helperAccepted("Grandma", 1) },
      ]);

      clearFakeOutbox();
      expect(await text(theo.phone, "Non")).toMatchObject({ action: "replied", state: "rejected" });
      expect(sent()).toEqual([
        { to: theo.phone, body: rejectReceived("Anastasia") },
        { to: anastasia.phone, body: helperRejected("Theo") },
      ]);
      expect(await signalsOf("h1")).toHaveLength(1);
    });

    it("says nothing twice for the same answer", async () => {
      await raise();
      await text(grandma.phone, "Y1");
      clearFakeOutbox();

      await text(grandma.phone, "Y1");

      expect(sent()).toEqual([]);
    });

    it("signs off the only offer on a bare OK and stands the others down", async () => {
      await raise();
      await text(grandma.phone, "Y1");
      clearFakeOutbox();

      expect(await text(anastasia.phone, "OK")).toMatchObject({ action: "signed_off" });

      expect(sent()).toEqual([
        { to: grandma.phone, body: youAreOn("Anastasia", 1) },
        { to: theo.phone, body: standDown("Anastasia", "Grandma") },
      ]);
      expect(await signedOff("h1")).toBe(grandma.id);
      expect((await signalsOf("h1"))[0]?.status).toBe("open");
    });

    it("asks which offer when OK is ambiguous, then keeps the other one warm", async () => {
      await raise();
      await text(grandma.phone, "Y1");
      await text(theo.phone, "Y1");
      clearFakeOutbox();

      expect(await text(anastasia.phone, "OK")).toEqual({ action: "sign_off_refused" });
      expect(sent()).toEqual([
        {
          to: anastasia.phone,
          body: signOffHelp([
            { name: "Grandma", slot: 1 },
            { name: "Theo", slot: 2 },
          ]),
        },
      ]);

      clearFakeOutbox();
      await text(anastasia.phone, "OK 2");
      expect(sent()).toEqual([
        { to: grandma.phone, body: standby("Anastasia", "Theo") },
        { to: theo.phone, body: youAreOn("Anastasia", 1) },
      ]);
      expect(await stateOf(grandma.id)).toEqual(["accepted"]);
    });

    it("goes back to alert when the signed off helper drops out", async () => {
      await seedHousehold("h3", "Spare", zoe, []);
      await env.DB.prepare("INSERT INTO memberships (household_id, person_id, role, name) VALUES ('h1', ?, 'helper', 'Zoe')").bind(zoe.id).run();
      await raise();
      await text(grandma.phone, "Y1");
      await text(theo.phone, "Y1");
      await text(anastasia.phone, "OK 1");
      clearFakeOutbox();

      expect(await text(grandma.phone, "N1 car won't start")).toMatchObject({ action: "replied", state: "rejected" });

      expect(await signedOff("h1")).toBeNull();
      expect(sent()).toEqual([
        { to: grandma.phone, body: rejectReceived("Anastasia") },
        { to: anastasia.phone, body: droppedOut("Grandma", [{ name: "Theo", slot: 2 }]) },
        { to: zoe.phone, body: stillNeeded("Anastasia", "Pickup at 5", 1) },
        { to: anastasia.phone, body: "Grandma: car won't start" },
      ]);
    });

    it("asks a parent which signal they mean before opening their own, and opens it when they send again", async () => {
      await seedHousehold("h2", "The Duponts", zoe, [anastasia]);
      await raise(zoe.phone, "Hospital, need a lift");

      expect(await text(anastasia.phone, "On my way")).toEqual({ action: "code_prompt" });
      expect(sent()).toEqual([{ to: anastasia.phone, body: codePrompt([{ name: "Zoe", code: 1 }], true) }]);
      expect(await signalsOf("h1")).toHaveLength(0);

      clearFakeOutbox();
      expect(await text(anastasia.phone, "Need someone to grab Leo at 5")).toMatchObject({ action: "opened" });
      expect(sent().map(({ to }) => to)).toEqual([grandma.phone, theo.phone]);
    });

    it("sends a parent's coded reply to the household they help, not their own", async () => {
      await seedHousehold("h2", "The Duponts", zoe, [anastasia]);
      await raise(zoe.phone, "Hospital, need a lift");

      expect(await text(anastasia.phone, "Y1 on my way")).toMatchObject({ action: "replied", state: "accepted" });

      expect(sent()).toEqual([
        { to: anastasia.phone, body: acceptReceived("Zoe") },
        { to: zoe.phone, body: helperAccepted("Anastasia", 1, "on my way") },
      ]);
      expect(await signalsOf("h1")).toHaveLength(0);

      clearFakeOutbox();
      expect(await text(anastasia.phone, "Pickup at 5")).toMatchObject({ action: "opened" });
    });

    it("gives a helper in two live signals a different code for each", async () => {
      await seedHousehold("h2", "The Duponts", zoe, [{ ...grandma, name: "Mamie" }]);
      await raise();
      await text(zoe.phone, "Hospital, need a lift");
      expect(sent()).toEqual([{ to: grandma.phone, body: signalWithCodes("Zoe", "Hospital, need a lift", 2) }]);

      clearFakeOutbox();
      expect(await text(grandma.phone, "Yes")).toEqual({ action: "code_prompt" });
      expect(sent()).toEqual([
        {
          to: grandma.phone,
          body: codePrompt(
            [
              { name: "Zoe", code: 2 },
              { name: "Anastasia", code: 1 },
            ],
            false,
          ),
        },
      ]);

      clearFakeOutbox();
      await text(grandma.phone, "Y2");
      expect(sent()).toEqual([
        { to: grandma.phone, body: acceptReceived("Zoe") },
        { to: zoe.phone, body: helperAccepted("Mamie", 1) },
      ]);
      expect(await stateOf(grandma.id)).toEqual(["not_read", "accepted"]);
    });
  });

  it("tells a helper when nothing is open, once an hour at most", async () => {
    expect(await text(theo.phone, "Anyone need anything?")).toEqual({ action: "nothing_open" });
    expect(await text(theo.phone, "Auto reply: I'm out of the office")).toEqual({ action: "ignored", reason: "reply_cooldown" });
    expect(sent()).toEqual([{ to: theo.phone, body: nothingOpen() }]);
  });

  it("ignores texts from the signal number itself", async () => {
    const result = await routeInbound({ ...env, SIGNAL_NUMBER: "+447700900777" }, { from: "+447700900777", body: "Hello", providerId: "loop-1" });
    expect(result).toEqual({ outcome: { action: "ignored", reason: "signal_number" }, deliveries: [] });
  });

  it("processes a webhook retry when the first attempt failed part way", async () => {
    const flaky = new Proxy(env.DB, {
      get(target, property) {
        if (property === "prepare") {
          return (sql: string) => {
            if (sql.includes("INSERT INTO signals")) throw new Error("D1 is having a moment");
            return target.prepare(sql);
          };
        }
        const value = Reflect.get(target, property);
        return typeof value === "function" ? value.bind(target) : value;
      },
    });

    await expect(routeInbound({ ...env, DB: flaky }, { from: anastasia.phone, body: "Hospital, need a ride now", providerId: "flaky-1" })).rejects.toThrow();
    expect(await text(anastasia.phone, "Hospital, need a ride now", "flaky-1")).toMatchObject({ action: "opened" });
    expect(sent().map(({ to }) => to)).toEqual([grandma.phone, theo.phone]);
  });

  it("opts out on STOP, without a reply, and never texts them again", async () => {
    expect(await text(grandma.phone, "Stop")).toEqual({ action: "opted_out" });
    expect(sent()).toEqual([]);

    const row = await env.DB.prepare("SELECT opted_out_at FROM people WHERE id = ?").bind(grandma.id).first<{ opted_out_at: string | null }>();
    expect(row?.opted_out_at).not.toBeNull();

    await text(anastasia.phone, "Pickup at 5");
    expect(sent()).toEqual([{ to: theo.phone, body: signalWithCodes("Anastasia", "Pickup at 5", 1) }]);

    clearFakeOutbox();
    await text(anastasia.phone, "SOLVED");
    expect(await text(grandma.phone, "hello?")).toEqual({ action: "nothing_open" });
    expect(sent()).toEqual([{ to: theo.phone, body: allClear("Anastasia") }]);
  });

  it("takes STOP from an unknown number without replying", async () => {
    expect(await text(stranger, "STOP")).toEqual({ action: "opted_out" });
    expect(sent()).toEqual([]);

    const row = await env.DB.prepare("SELECT opted_out_at FROM people WHERE phone = ?").bind(stranger).first<{ opted_out_at: string | null }>();
    expect(row?.opted_out_at).not.toBeNull();
    expect(await text(stranger, "Hello?")).toEqual({ action: "signup_link" });
    expect(sent()).toEqual([]);
  });

  it("sends an unknown number the sign up link once, then ignores it", async () => {
    expect(await text(stranger, "Hi, is this the football group?")).toEqual({ action: "signup_link" });
    expect(await text(stranger, "Hello??")).toEqual({ action: "ignored", reason: "signup_link_already_sent" });
    expect(sent()).toEqual([{ to: stranger, body: signupLink() }]);

    const { results } = await env.DB.prepare("SELECT body FROM messages WHERE phone = ? AND direction = 'in'").bind(stranger).all<{ body: string }>();
    expect(results).toEqual([{ body: "" }, { body: "" }]);
  });

  it("ignores a repeated provider id", async () => {
    await text(anastasia.phone, "Pickup at 5", "retry-1");
    clearFakeOutbox();

    expect(await text(anastasia.phone, "Pickup at 5", "retry-1")).toEqual({ action: "duplicate" });
    expect(sent()).toEqual([]);
    expect(await signalsOf("h1")).toHaveLength(1);
  });

  it("refuses a signal over the character limit and tells the parent, once an hour at most", async () => {
    expect(await text(anastasia.phone, "x".repeat(MAX_SIGNAL_LENGTH + 1))).toEqual({ action: "refused", reason: "signal_too_long" });
    expect(await text(anastasia.phone, "y".repeat(MAX_SIGNAL_LENGTH + 1))).toEqual({ action: "ignored", reason: "reply_cooldown" });
    expect(await signalsOf("h1")).toEqual([]);
    expect(sent()).toEqual([{ to: anastasia.phone, body: signalTooLong() }]);
  });

  it("stops broadcasting updates once the parent hits the daily cap, and says so", async () => {
    for (let i = 0; i < MAX_BROADCASTS_PER_DAY; i++) await text(anastasia.phone, `Update ${i}`);
    clearFakeOutbox();

    expect(await text(anastasia.phone, "Auto reply: I'm driving")).toEqual({ action: "refused", reason: "rate_limited" });
    expect(sent()).toEqual([{ to: anastasia.phone, body: tooManyTexts() }]);
  });

  it("refuses a signal over the daily limit and tells the parent", async () => {
    for (let i = 0; i < MAX_SIGNALS_PER_DAY; i++) await insertSignal("h1", isoAgo(60_000 * (i + 1)), "solved");

    expect(await text(anastasia.phone, "Pickup at 5")).toEqual({ action: "refused", reason: "too_many_signals" });
    expect(sent()).toEqual([{ to: anastasia.phone, body: tooManySignals() }]);
  });

  it("keeps broadcasting when one send fails, and records both outcomes", async () => {
    await env.DB.batch([
      env.DB.prepare("INSERT INTO people (id, phone, name) VALUES ('p-broken', ?, 'Broken')").bind(FAKE_FAILING_NUMBER),
      env.DB.prepare("INSERT INTO memberships (household_id, person_id, role) VALUES ('h1', 'p-broken', 'helper')"),
    ]);

    await text(anastasia.phone, "Pickup at 5");

    expect(sent().map(({ to }) => to)).toEqual([grandma.phone, theo.phone]);
    expect((await outboundMessages()).map(({ phone, status }) => ({ phone, status }))).toEqual([
      { phone: grandma.phone, status: "sent" },
      { phone: theo.phone, status: "sent" },
      { phone: FAKE_FAILING_NUMBER, status: "failed" },
    ]);
  });

  it("keeps one open signal when the parent texts twice at once", async () => {
    const outcomes = await Promise.all([
      routeInbound(env, { from: anastasia.phone, body: "Pickup at 5", providerId: "a" }),
      routeInbound(env, { from: anastasia.phone, body: "Nappies too", providerId: "b" }),
    ]);

    expect(outcomes.map(({ outcome }) => outcome.action).sort()).toEqual(["opened", "updated"]);
    expect(await signalsOf("h1")).toHaveLength(1);
  });
});
