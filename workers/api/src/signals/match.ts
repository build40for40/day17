import type { HouseholdRow } from "../db";

const ENDPOINT = "https://api.typesafe.ai/v1/systemone";
const MODEL = "jev-latest";
const TIMEOUT_MS = 5000;

type MatchGroup = Pick<HouseholdRow, "id" | "name" | "description">;

function question(group: MatchGroup) {
  return {
    type: "noul",
    instructions: {
      question: "Would the person who wrote `message` want it sent to the people in this group?",
      group: group.description ? { name: group.name, description: group.description } : { name: group.name },
    },
    criteria: {
      true: "The group was set up for the people, the place or the kind of help that `message` is about.",
      false: "`message` is about something this group was not set up for.",
    },
  };
}

export function matchRequest(text: string, groups: MatchGroup[]) {
  return {
    model: MODEL,
    state: { message: text },
    questions: Object.fromEntries(groups.map((group) => [group.id, question(group)])),
  };
}

export async function matchGroups(env: Env, text: string, groups: MatchGroup[], fetcher: typeof fetch = fetch): Promise<Map<string, number>> {
  if (!env.TYPESAFE_API_KEY) throw new Error("TYPESAFE_API_KEY is not set");

  const response = await fetcher(ENDPOINT, {
    method: "POST",
    headers: { Authorization: `Bearer ${env.TYPESAFE_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify(matchRequest(text, groups)),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`TypeSafe answered ${response.status}`);

  const { answers } = (await response.json()) as { answers?: Record<string, { noul?: unknown }> };
  return new Map(
    groups.map((group) => {
      const score = answers?.[group.id]?.noul;
      if (typeof score !== "number" || !Number.isFinite(score)) throw new Error(`TypeSafe gave no answer for group ${group.id}`);
      return [group.id, score];
    }),
  );
}
