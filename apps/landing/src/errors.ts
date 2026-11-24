import { MAX_DESCRIPTION_LENGTH, MAX_HELPERS, MAX_SIGNALS_PER_DAY, MAX_SIGNAL_LENGTH, type ErrorCode } from 'contract'

import { ApiError } from './api'

export const errorMessages: Record<ErrorCode | 'network', string> = {
  network: "We can't connect. Check your internet and try again.",
  invalid_json: 'Something went sideways on our end. Give it another go.',
  invalid_request: "That didn't look right. Check the fields and try again.",
  payload_too_large: 'That is a lot of text. Trim it down a bit.',
  unsupported_media_type: 'Something went sideways on our end. Give it another go.',
  invalid_phone: "That doesn't look like a UK mobile number. Check the digits.",
  invalid_name: 'Everyone needs a name, and not a novel. Keep it short.',
  invalid_description: `Say what the group is for, in under ${MAX_DESCRIPTION_LENGTH} characters.`,
  invalid_code: "That code doesn't match. Have another look at the text.",
  turnstile_failed: "We couldn't tell you apart from a robot. Refresh and try again.",
  rate_limited: "That's a lot in a short time. Wait a bit and try again.",
  too_many_attempts: 'Too many wrong guesses. Ask for a fresh code.',
  unauthorized: 'Your session ran out. Sign in again with your number.',
  forbidden: "You're not allowed to do that.",
  too_many_households: "That's the most groups one person can have. Delete one to make room.",
  no_household: 'Set up your group first.',
  too_many_helpers: `${MAX_HELPERS} people is the most a group can have.`,
  duplicate_helper: 'The same number is on your list twice.',
  signal_too_long: `Keep it under ${MAX_SIGNAL_LENGTH} characters. Short asks get quicker answers.`,
  too_many_signals: `That's ${MAX_SIGNALS_PER_DAY} lanterns in 24 hours. Try again later, or just call someone.`,
  no_open_signal: "There's no lantern lit right now.",
  classifier_unavailable: "We couldn't guess the groups this time. Pick them yourself.",
  not_accepted: "They haven't said they can help yet, so there's nothing to confirm.",
  not_found: "We couldn't find that.",
  method_not_allowed: 'Something went sideways on our end. Give it another go.',
  not_implemented: "That bit isn't built yet. Check back soon.",
  internal_error: 'Something broke on our side. Try again in a moment.',
}

export function messageFor(error: unknown): string {
  const code = error instanceof ApiError ? error.code : 'internal_error'
  return errorMessages[code]
}

export const isUnauthorized = (error: unknown) => error instanceof ApiError && error.code === 'unauthorized'
