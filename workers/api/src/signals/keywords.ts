const SOLVE_WORDS = new Set(["SOLVED", "RESOLU"]);

export function keyword(body: string): string {
  return body
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/^[\p{P}\p{Z}\s]+|[\p{P}\p{Z}\s]+$/gu, "")
    .toUpperCase();
}

export function isSolveKeyword(body: string): boolean {
  return SOLVE_WORDS.has(keyword(body));
}

export function isStopKeyword(body: string): boolean {
  return keyword(body) === "STOP";
}
