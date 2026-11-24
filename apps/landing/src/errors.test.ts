import { describe, expect, it } from 'vitest'

import { ApiError } from './api'
import { errorMessages, isUnauthorized, messageFor } from './errors'

describe('errors', () => {
  it('has a friendly message for every code, with no mid-sentence dashes', () => {
    for (const message of Object.values(errorMessages)) {
      expect(message.length).toBeGreaterThan(10)
      expect(message).not.toMatch(/[–—]| - /)
    }
  })

  it('maps an ApiError to its message and anything else to the fallback', () => {
    expect(messageFor(new ApiError('invalid_phone'))).toBe(errorMessages.invalid_phone)
    expect(messageFor(new Error('boom'))).toBe(errorMessages.internal_error)
  })

  it('spots an unauthorized error', () => {
    expect(isUnauthorized(new ApiError('unauthorized'))).toBe(true)
    expect(isUnauthorized(new ApiError('invalid_code'))).toBe(false)
  })
})
