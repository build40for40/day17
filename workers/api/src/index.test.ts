import { exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

const call = (path: string, init?: RequestInit) => exports.default.fetch(`https://build40for40.com${path}`, init);

describe("api", () => {
  it("says hi on GET /greeting", async () => {
    const response = await call("/day17/api/v1/greeting");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ message: "The Worker says hi" });
  });

  it("only allows GET on /greeting", async () => {
    const response = await call("/day17/api/v1/greeting", { method: "POST" });
    expect(response.status).toBe(405);
    expect(response.headers.get("Allow")).toBe("GET");
  });

  it("404s anything else", async () => {
    expect((await call("/day17/api/v1/nope")).status).toBe(404);
    expect((await call("/day17")).status).toBe(404);
  });
});
