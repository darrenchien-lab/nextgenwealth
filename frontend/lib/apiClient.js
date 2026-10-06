const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3000'
const TOKEN_KEY = 'financeflow_token'

export function getToken() {
  if (typeof window === 'undefined') return null
  return window.localStorage.getItem(TOKEN_KEY)
}

export function setToken(token) {
  window.localStorage.setItem(TOKEN_KEY, token)
}

export function clearToken() {
  window.localStorage.removeItem(TOKEN_KEY)
}

class ApiError extends Error {
  constructor(message, status, code) {
    super(message)
    this.status = status
    this.code = code
  }
}

// Every page/feature calls this instead of fetch directly, so token
// attachment and "session was rejected" redirect logic live in one place
// (design.md Decision 2) rather than being repeated on every page.
export async function request(path, options = {}) {
  const token = getToken()
  const headers = { ...(options.headers || {}) }
  if (!(options.body instanceof FormData) && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json'
  }
  if (token) headers['Authorization'] = `Bearer ${token}`

  let response
  try {
    response = await fetch(`${API_BASE_URL}${path}`, { ...options, headers })
  } catch {
    // fetch only rejects when no response arrived at all — almost always the
    // backend not running (yet), which the browser reports as a bare
    // "Failed to fetch". Say what's actually wrong instead.
    throw new ApiError(`Can't reach the server at ${API_BASE_URL}. Make sure the backend is running, then refresh the page.`, 0, 'NETWORK_ERROR')
  }

  if (response.status === 401) {
    clearToken()
    if (typeof window !== 'undefined') window.location.href = '/login'
    throw new ApiError('Session expired', 401, 'UNAUTHORIZED')
  }

  const isBinary = (response.headers.get('content-type') || '').includes('application/')
    && !(response.headers.get('content-type') || '').includes('application/json')

  if (isBinary && response.ok) {
    return response.blob()
  }

  const data = await response.json().catch(() => ({}))

  if (!response.ok) {
    throw new ApiError(data?.message || 'Request failed', response.status, data?.code)
  }

  return data
}

export { ApiError }
