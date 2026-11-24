import {
  API_BASE,
  type CreateHouseholdRequest,
  type CreateHouseholdResponse,
  type CreateSignalResponse,
  type ErrorCode,
  type MatchSignalResponse,
  type MeResponse,
  type SignOffResponse,
  type SolveSignalResponse,
} from 'contract'

export class ApiError extends Error {
  constructor(readonly code: ErrorCode | 'network') {
    super(code)
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  let response: Response
  try {
    response = await fetch(`${API_BASE}${path}`, {
      method,
      credentials: 'include',
      headers: body === undefined ? undefined : { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch {
    throw new ApiError('network')
  }

  if (response.status === 204) return undefined as T

  const data: unknown = await response.json().catch(() => null)
  if (!response.ok) {
    const code = (data as { error?: ErrorCode } | null)?.error
    throw new ApiError(code ?? 'internal_error')
  }
  return data as T
}

export const startVerification = (phone: string) => request<{ ok: true }>('POST', '/verify/start', { phone })

export const checkVerification = (phone: string, code: string) =>
  request<{ ok: true }>('POST', '/verify/check', { phone, code })

export const getMe = () => request<MeResponse>('GET', '/me')

export const createHousehold = (input: CreateHouseholdRequest) =>
  request<CreateHouseholdResponse>('POST', '/households', input)

export const deleteHousehold = (householdId: string) =>
  request<void>('DELETE', `/households/mine?id=${encodeURIComponent(householdId)}`)

export const sendSignal = (householdIds: string[], text: string) =>
  request<CreateSignalResponse>('POST', '/signals', { householdIds, text })

export const matchSignal = (text: string) => request<MatchSignalResponse>('POST', '/signals/match', { text })

export const solveSignal = (householdId: string) =>
  request<SolveSignalResponse>('POST', '/signals/solve', { householdId })

export const signOff = (householdId: string, personId: string) =>
  request<SignOffResponse>('POST', '/signals/sign-off', { householdId, personId })
