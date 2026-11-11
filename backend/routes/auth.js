'use strict'
const router = require('express').Router()
const authService = require('../services/auth')
const { requireAuth } = require('../middleware')
const { asyncHandler } = require('../shared/utils')

router.post('/register', asyncHandler(async (req, res) => {
  const user = await authService.register(req.body || {})
  res.status(201).json({ success: true, user })
}))

router.post('/login', asyncHandler(async (req, res) => {
  const { token, expiresAt } = await authService.login(req.body || {}, { ip: req.ip })
  res.json({ success: true, token, expiresAt })
}))

router.post('/logout', requireAuth, asyncHandler(async (req, res) => {
  await authService.logout(req.tokenId, req.tokenExpiresAt)
  res.json({ success: true })
}))

router.get('/me', requireAuth, asyncHandler(async (req, res) => {
  res.json({ success: true, user: await authService.getMe(req.userId) })
}))

router.post('/change-password', requireAuth, asyncHandler(async (req, res) => {
  const { token, expiresAt } = await authService.changePassword(req.userId, req.body || {}, { tokenLifetimeSeconds: req.tokenLifetimeSeconds })
  res.json({ success: true, token, expiresAt })
}))

router.post('/logout-all', requireAuth, asyncHandler(async (req, res) => {
  await authService.logoutEverywhere(req.userId)
  res.json({ success: true })
}))

router.delete('/account', requireAuth, asyncHandler(async (req, res) => {
  await authService.deleteAccount(req.userId, req.body || {})
  res.json({ success: true })
}))

router.post('/forgot-password', asyncHandler(async (req, res) => {
  const result = await authService.requestPasswordReset(req.body?.email)
  res.json({ success: true, ...result })
}))

router.post('/reset-password', asyncHandler(async (req, res) => {
  await authService.resetPassword(req.body || {})
  res.json({ success: true })
}))

router.post('/verify-email', asyncHandler(async (req, res) => {
  await authService.verifyEmail(req.body?.token)
  res.json({ success: true })
}))

router.post('/resend-verification', asyncHandler(async (req, res) => {
  const result = await authService.resendVerificationEmail(req.body?.email)
  res.json({ success: true, ...result })
}))

module.exports = router
