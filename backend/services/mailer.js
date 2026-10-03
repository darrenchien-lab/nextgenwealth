'use strict'
const nodemailer = require('nodemailer')
require('dotenv').config()

let transporter = null

const getTransporter = () => {
  if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) {
    throw new Error('Email is not configured: set GMAIL_USER and GMAIL_APP_PASSWORD in .env')
  }
  if (!transporter) {
    transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD }
    })
  }
  return transporter
}

const sendPasswordResetEmail = async (toEmail, rawToken) => {
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3001'
  const resetLink = `${frontendUrl}/reset-password?token=${rawToken}`
  await getTransporter().sendMail({
    from: process.env.GMAIL_USER,
    to: toEmail,
    subject: 'Reset your NextGen Wealth password',
    text: `Click this link to reset your NextGen Wealth password (expires in 1 hour): ${resetLink}`,
    html: `<p>Click the link below to reset your NextGen Wealth password. This link expires in 1 hour.</p><p><a href="${resetLink}">${resetLink}</a></p>`
  })
}

const sendVerificationEmail = async (toEmail, rawToken) => {
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3001'
  const verifyLink = `${frontendUrl}/verify-email?token=${rawToken}`
  await getTransporter().sendMail({
    from: process.env.GMAIL_USER,
    to: toEmail,
    subject: 'Verify your NextGen Wealth email',
    text: `Click this link to verify your NextGen Wealth account (expires in 24 hours): ${verifyLink}`,
    html: `<p>Click the link below to verify your NextGen Wealth account. This link expires in 24 hours.</p><p><a href="${verifyLink}">${verifyLink}</a></p>`
  })
}

module.exports = { sendPasswordResetEmail, sendVerificationEmail }
