import { env } from "cloudflare:workers";
import { MAX_SIGNAL_LENGTH, MAX_SIGNALS_PER_DAY } from "contract";
import { MAX_BROADCASTS_PER_DAY } from "../limits";
import { beforeEach, describe, expect, it } from "vitest";
import { clearDatabase } from "../../test/db";
import { isoAgo } from "../db";
import { allClear, signalWithCodes, updateWithCodes } from "../sms/texts";
import { anastasia, camille, grandma, insertSignal, seedHousehold, signalsOf, theo } from "./fixtures";
import { closeStaleSignals, findOwned, raiseSignal, solveSignal, type Owner } from "./signals";

const HOUR = 60 * 60 * 1000;

describe("signals", () => {
  let owner: Owner;

  beforeEach(async () => {
    await clearDatabase();
    owner = await seedHousehold("h1", "The Martins", anastasia, [grandma, theo, { ...camille, optedOut: true }]);
  });

  describe("findOwned", () => {
    it("finds the person and every household they own", async () => {
      await seedHousehold("h2", "Football", anastasia, [theo]);

      const found = await findOwned(env, anastasia.id);

      expect(found.person?.phone).toBe(anastasia.phone);
      expect(found.households.map(({ id }) => id).sort()).toEqual(["h1", "h2"]);
    });

    it("gives no household to a helper", async () => {
      expect(await findOwned(env, grandma.id)).toMatchObject({ person: { id: grandma.id }, households: [] });
    });

    it("gives nothing for someone who is gone", async () => {
      expect(await findOwned(env, "p-gone")).toEqual({ person: null, households: [] });
    });
  });

  describe("raiseSignal", () => {
    it("opens a signal and broadcasts it to helpers who haven't opted out", async () => {
      const result = await raiseSignal(env, owner, "  Can anyone grab Leo at 5?  ", "web");

      expect(result).toMatchObject({ ok: true, action: "opened", signal: { text: "Can anyone grab Leo at 5?", source: "web", status: "open" } });
      if (!result.ok) return;
      expect(result.deliveries).toEqual([
        { to: grandma.phone, body: signalWithCodes("Anastasia", "Can anyone grab Leo at 5?", 1), kind: "signal", householdId: "h1", signalId: result.signal.id, personId: grandma.id },
        { to: theo.phone, body: signalWithCodes("Anastasia", "Can anyone grab Leo at 5?", 1), kind: "signal", householdId: "h1", signalId: result.signal.id, personId: theo.id },
      ]);
    });

    it(`caps a parent at ${MAX_BROADCASTS_PER_DAY} broadcasts a day, updates included`, async () => {
      for (let i = 0; i < MAX_BROADCASTS_PER_DAY; i++) expect(await raiseSignal(env, owner, `Update ${i}`, "web")).toMatchObject({ ok: true });
      expect(await raiseSignal(env, owner, "One more", "web")).toEqual({ ok: false, error: "rate_limited" });
    });

    it("sends the text as an update when a signal is already open", async () => {
      const first = await raiseSignal(env, owner, "Pickup at 5", "web");
      const second = await raiseSignal(env, owner, "Found a car, never mind the bus", "sms");

      expect(second).toMatchObject({ ok: true, action: "updated" });
      if (!first.ok || !second.ok) return;
      expect(second.signal.id).toBe(first.signal.id);
      expect(second.deliveries.map(({ kind, body }) => ({ kind, body }))).toEqual([
        { kind: "update", body: updateWithCodes("Anastasia", "Found a car, never mind the bus", 1) },
        { kind: "update", body: updateWithCodes("Anastasia", "Found a car, never mind the bus", 1) },
      ]);
      expect(await signalsOf("h1")).toHaveLength(1);
    });

    it("turns the text into an update when another signal wins the race to open", async () => {
      let rivalId: string | null = null;
      const racingDb = new Proxy(env.DB, {
        get(target, key) {
          if (key !== "prepare") {
            const value = Reflect.get(target, key, target);
            return typeof value === "function" ? value.bind(target) : value;
          }
          return (sql: string) => {
            const statement = target.prepare(sql);
            if (!sql.startsWith("INSERT INTO signals")) return statement;
            return {
              bind: (...values: unknown[]) => ({
                first: async () => {
                  rivalId = await insertSignal("h1", isoAgo(0));
                  return statement.bind(...values).first();
                },
              }),
            };
          };
        },
      });

      const result = await raiseSignal({ ...env, DB: racingDb }, owner, "Pickup at 5", "web");

      expect(result).toMatchObject({ ok: true, action: "updated", signal: { id: rivalId } });
      expect(result.ok && result.deliveries.map(({ kind }) => kind)).toEqual(["update", "update"]);
      expect(await signalsOf("h1")).toHaveLength(1);
    });

    it("leaves the reply codes off when the provider can't receive texts", async () => {
      const result = await raiseSignal({ ...env, SMS_PROVIDER: "textbelt", TEXTBELT_KEY: "test" }, owner, "Pickup at 5", "web");

      expect(result.ok && result.deliveries.map(({ body }) => body)).toEqual(["Anastasia: Pickup at 5", "Anastasia: Pickup at 5"]);
    });

    it("uses the household name when the parent has none", async () => {
      const result = await raiseSignal(env, { ...owner, person: { ...owner.person, name: null } }, "Pickup at 5", "web");
      expect(result.ok && result.deliveries[0]?.body).toBe(signalWithCodes("The Martins", "Pickup at 5", 1));
    });

    it("refuses an empty text", async () => {
      expect(await raiseSignal(env, owner, "   ", "web")).toEqual({ ok: false, error: "invalid_request" });
    });

    it("refuses more than the character limit, for signals and updates alike", async () => {
      expect(await raiseSignal(env, owner, "x".repeat(MAX_SIGNAL_LENGTH), "web")).toMatchObject({ ok: true, action: "opened" });
      expect(await raiseSignal(env, owner, "x".repeat(MAX_SIGNAL_LENGTH + 1), "web")).toEqual({ ok: false, error: "signal_too_long" });
    });

    it("allows five signals per rolling 24 hours", async () => {
      await insertSignal("h1", isoAgo(25 * HOUR), "solved");
      for (let hour = 1; hour < MAX_SIGNALS_PER_DAY; hour++) await insertSignal("h1", isoAgo(hour * HOUR), "solved");

      expect(await raiseSignal(env, owner, "Fifth", "web")).toMatchObject({ ok: true, action: "opened" });
      await solveSignal(env, owner);
      expect(await raiseSignal(env, owner, "Sixth", "web")).toEqual({ ok: false, error: "too_many_signals" });
    });

    it("still takes updates once the daily limit is reached", async () => {
      for (let hour = 1; hour < MAX_SIGNALS_PER_DAY; hour++) await insertSignal("h1", isoAgo(hour * HOUR), "solved");
      await raiseSignal(env, owner, "Fifth", "web");
      expect(await raiseSignal(env, owner, "On the way?", "web")).toMatchObject({ ok: true, action: "updated" });
    });
  });

  describe("solveSignal", () => {
    it("closes the open signal and sends the all clear to helpers", async () => {
      await raiseSignal(env, owner, "Pickup at 5", "web");
      const result = await solveSignal(env, owner);

      expect(result).toMatchObject({ ok: true, signal: { status: "solved" } });
      if (!result.ok) return;
      expect(result.signal.solved_at).not.toBeNull();
      expect(result.deliveries.map(({ to, kind, body }) => ({ to, kind, body }))).toEqual([
        { to: grandma.phone, kind: "all_clear", body: allClear("Anastasia") },
        { to: theo.phone, kind: "all_clear", body: allClear("Anastasia") },
      ]);
    });

    it("says when nothing is open", async () => {
      expect(await solveSignal(env, owner)).toEqual({ ok: false, error: "no_open_signal" });
    });
  });

  describe("closeStaleSignals", () => {
    it("closes signals open longer than 24 hours and leaves the rest", async () => {
      await seedHousehold("h2", "The Duponts", camille, []);
      const stale = await insertSignal("h1", isoAgo(25 * HOUR));
      const fresh = await insertSignal("h2", isoAgo(HOUR));

      expect(await closeStaleSignals(env)).toBe(1);

      const rows = [...(await signalsOf("h1")), ...(await signalsOf("h2"))];
      expect(rows.find((row) => row.id === stale)).toMatchObject({ status: "solved" });
      expect(rows.find((row) => row.id === fresh)).toMatchObject({ status: "open", solved_at: null });
    });
  });
});
