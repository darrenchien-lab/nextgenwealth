'use strict'

class AppError extends Error {
  constructor(statusCode, code, message) {
    super(message)
    this.statusCode = statusCode
    this.code = code
  }
}

const badRequest = (message) => new AppError(400, 'VALIDATION_ERROR', message)
const unauthorized = (message = 'Unauthorized') => new AppError(401, 'UNAUTHORIZED', message)
const forbidden = (message = 'Forbidden') => new AppError(403, 'FORBIDDEN', message)
const notFound = (message = 'Resource not found') => new AppError(404, 'NOT_FOUND', message)
const conflict = (message) => new AppError(409, 'CONFLICT', message)

// Wraps an async route handler so a rejected promise reaches Express's error
// handler instead of becoming an unhandled rejection.
const asyncHandler = (handler) => (req, res, next) => {
  Promise.resolve(handler(req, res, next)).catch(next)
}

// Every module that fetches a row by id calls this before using it, so a
// request for another user's resource looks identical to a missing one
// instead of leaking whether the id exists.
const assertOwned = (row, userId, message = 'Resource not found') => {
  if (!row || row.user_id !== userId) {
    throw notFound(message)
  }
  return row
}

module.exports = {
  AppError,
  badRequest,
  unauthorized,
  forbidden,
  notFound,
  conflict,
  asyncHandler,
  assertOwned
}
