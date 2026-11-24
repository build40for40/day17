import { afterEach, describe, expect, it, vi } from 'vitest'

import { ApiError, deleteHousehold, getMe, sendSignal } from './api'

afterEach(() => vi.unstubAllGlobals())

describe('api client', () => {
  it('calls the versioned base path with credentials and a JSON body', async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ signals: [] }, { status: 201 }))
    vi.stubGlobal('fetch', fetchMock)

    await sendSignal(['h1'], 'help')

    expect(fetchMock).toHaveBeenCalledWith('/day17/api/v1/signals', {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ householdIds: ['h1'], text: 'help' }),
    })
  })

  it('turns an error body into an ApiError with its code', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ error: 'unauthorized' }, { status: 401 })))

    await expect(getMe()).rejects.toMatchObject({ code: 'unauthorized' })
  })

  it('reports a network failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))

    const error = await getMe().catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ApiError)
    expect((error as ApiError).code).toBe('network')
  })

  it('accepts an empty 204', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 204 })))

    await expect(deleteHousehold('h1')).resolves.toBeUndefined()
  })
})
