const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3000'
const TOKEN_KEY = 'financeflow_token'
const NETWORK_RETRIES = 5
const NETWORK_RETRY_DELAY_MS = 1500

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

  // fetch only rejects when no response arrived at all — almost always the
  // backend not running yet or briefly restarting. Reads are retried for a
  // few seconds to ride that out; writes are not, since a write that did
  // reach the server must never be sent twice.
  const method = (options.method || 'GET').toUpperCase()
  const attempts = method === 'GET' ? NETWORK_RETRIES + 1 : 1
  let response
  for (let attempt = 1; !response; attempt++) {
    try {
      response = await fetch(`${API_BASE_URL}${path}`, { ...options, headers })
    } catch {
      if (attempt >= attempts) {
        throw new ApiError(`Can't reach the server at ${API_BASE_URL}. Make sure the backend is running, then refresh the page.`, 0, 'NETWORK_ERROR')
      }
      await new Promise((resolve) => setTimeout(resolve, NETWORK_RETRY_DELAY_MS))
    }
  }

  // A 401 on a signed-in request means the session ran out or was revoked:
  // back to the login page, which says so. A 401 without a token (a wrong
  // password on the login form itself) is just an error for that form.
  if (response.status === 401 && token) {
    clearToken()
    if (typeof window !== 'undefined') window.location.href = '/login?expired=1'
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
