'use strict'
const PDFDocument = require('pdfkit')
const ExcelJS = require('exceljs')
const { badRequest } = require('../shared/utils')

const SUPPORTED_FORMATS = ['pdf', 'excel']

const generatePdfBuffer = (summary) =>
  new Promise((resolve, reject) => {
    const doc = new PDFDocument()
    const chunks = []
    doc.on('data', (chunk) => chunks.push(chunk))
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)

    doc.fontSize(18).text('NextGen Wealth Report', { underline: true })
    doc.moveDown()
    doc.fontSize(12)
    Object.entries(summary).forEach(([key, value]) => {
      doc.text(`${key}: ${value}`)
    })
    doc.end()
  })

const generateExcelBuffer = async (summary) => {
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet('Report')
  sheet.columns = [{ header: 'Metric', key: 'metric', width: 30 }, { header: 'Value', key: 'value', width: 20 }]
  Object.entries(summary).forEach(([key, value]) => sheet.addRow({ metric: key, value }))
  return workbook.xlsx.writeBuffer()
}

const exportReport = async (format, summary) => {
  if (!SUPPORTED_FORMATS.includes(format)) {
    throw badRequest(`format must be one of: ${SUPPORTED_FORMATS.join(', ')}`)
  }
  if (format === 'pdf') {
    return { buffer: await generatePdfBuffer(summary), contentType: 'application/pdf', filename: 'report.pdf' }
  }
  return {
    buffer: await generateExcelBuffer(summary),
    contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    filename: 'report.xlsx'
  }
}

module.exports = { exportReport, SUPPORTED_FORMATS }
