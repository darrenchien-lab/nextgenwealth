'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { ArrowLeft, Layers, Wallet, TrendingUp, Receipt, History, ArrowUpRight, ArrowDownRight } from 'lucide-react'
import { request } from '@/lib/apiClient'
import { formatCurrency, formatQuantity } from '@/lib/format'
import CardHeader from '@/components/CardHeader'
import SummaryCard from '@/components/SummaryCard'

const ASSET_TYPE_LABELS = { stock: 'Stock', mutual_fund: 'Mutual Fund', crypto: 'Crypto', etf: 'ETF', bond: 'Bond', gold: 'Gold', property: 'Property', other: 'Other' }

function gainClass(value) {
  if (value === null || value === undefined) return 'text-gray-400 dark:text-gray-500'
  return value >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'
}

function signed(value, currency) {
  return `${value >= 0 ? '+' : ''}${formatCurrency(value, currency)}`
}

export default function HoldingDetailPage() {
  const { id } = useParams()
  const [holding, setHolding] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    async function load() {
      try {
        const data = await request(`/investments/${id}/detail`)
        setHolding(data.holding)
      } catch (err) {
        setError(err.message || 'Failed to load this holding')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [id])

  const currency = holding?.currency

  return (
    <div className="space-y-6">
      <div>
        <Link href="/investments" className="inline-flex items-center gap-1 text-sm text-gray-500 dark:text-gray-400 hover:text-emerald-600 dark:hover:text-emerald-400">
          <ArrowLeft size={14} /> Investments
        </Link>
        <div className="mt-2 flex flex-wrap items-end justify-between gap-2">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">{holding ? holding.assetName : 'Holding'}</h1>
            {holding && (
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {[ASSET_TYPE_LABELS[holding.assetType] || holding.assetType, holding.category, holding.currency, holding.isClosed ? 'Closed' : null].filter(Boolean).join(' · ')}
              </p>
            )}
          </div>
          {holding && (
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Last price <span className="ml-1 text-lg font-semibold text-gray-900 dark:text-gray-100">{formatCurrency(holding.currentPrice, currency)}</span>
            </p>
          )}
        </div>
      </div>

      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
      {loading && <p className="text-sm text-gray-500 dark:text-gray-400">Loading...</p>}

      {holding && (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <SummaryCard icon={Layers} color="slate" label="Quantity" value={formatQuantity(holding.quantity)} />
            <SummaryCard icon={Wallet} color="blue" label="Value" value={formatCurrency(holding.value, currency)} />
            <SummaryCard icon={TrendingUp} color={holding.unrealizedGain >= 0 ? 'emerald' : 'red'} label="Unrealized P/L (after fees)" value={signed(holding.unrealizedGain, currency)} change={holding.returnPercentage} />
            <SummaryCard icon={Receipt} color="amber" label="Fees paid" value={formatCurrency(holding.feesTotal, currency)} />
          </div>

          <div className="rounded-2xl bg-white dark:bg-gray-800 p-5 shadow-sm ring-1 ring-gray-100 dark:ring-gray-700">
            <CardHeader icon={Wallet} color="violet" title="Cost basis" subtitle="With fees is what actually left your account; without fees matches most broker apps" />
            <div className="-mx-5 overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 dark:bg-gray-900/40 text-left text-xs uppercase text-gray-500 dark:text-gray-400">
                  <tr>
                    <th className="px-5 py-3"></th>
                    <th className="px-5 py-3 text-right">With fees</th>
                    <th className="px-5 py-3 text-right">Without fees</th>
                  </tr>
                </thead>
                <tbody className="text-gray-900 dark:text-gray-100">
                  <tr className="border-t border-gray-100 dark:border-gray-700">
                    <td className="px-5 py-3 text-gray-600 dark:text-gray-400">Cost basis</td>
                    <td className="whitespace-nowrap px-5 py-3 text-right font-medium">{formatCurrency(holding.costBasis, currency)}</td>
                    <td className="whitespace-nowrap px-5 py-3 text-right">{formatCurrency(holding.costBasisExcludingFees, currency)}</td>
                  </tr>
                  <tr className="border-t border-gray-100 dark:border-gray-700">
                    <td className="px-5 py-3 text-gray-600 dark:text-gray-400">Average price</td>
                    <td className="whitespace-nowrap px-5 py-3 text-right font-medium">{holding.averagePrice === null ? '-' : formatCurrency(holding.averagePrice, currency)}</td>
                    <td className="whitespace-nowrap px-5 py-3 text-right">{holding.averagePriceExcludingFees === null ? '-' : formatCurrency(holding.averagePriceExcludingFees, currency)}</td>
                  </tr>
                  <tr className="border-t border-gray-100 dark:border-gray-700">
                    <td className="px-5 py-3 text-gray-600 dark:text-gray-400">Unrealized P/L</td>
                    <td className={`whitespace-nowrap px-5 py-3 text-right font-medium ${gainClass(holding.unrealizedGain)}`}>{signed(holding.unrealizedGain, currency)}</td>
                    <td className={`whitespace-nowrap px-5 py-3 text-right ${gainClass(holding.unrealizedGainExcludingFees)}`}>{signed(holding.unrealizedGainExcludingFees, currency)}</td>
                  </tr>
                  <tr className="border-t border-gray-100 dark:border-gray-700">
                    <td className="px-5 py-3 text-gray-600 dark:text-gray-400">Return</td>
                    <td className={`whitespace-nowrap px-5 py-3 text-right font-medium ${gainClass(holding.returnPercentage)}`}>{holding.returnPercentage === null ? '-' : `${holding.returnPercentage >= 0 ? '+' : ''}${holding.returnPercentage}%`}</td>
                    <td className={`whitespace-nowrap px-5 py-3 text-right ${gainClass(holding.returnPercentageExcludingFees)}`}>{holding.returnPercentageExcludingFees === null ? '-' : `${holding.returnPercentageExcludingFees >= 0 ? '+' : ''}${holding.returnPercentageExcludingFees}%`}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <div className="rounded-2xl bg-white dark:bg-gray-800 p-5 shadow-sm ring-1 ring-gray-100 dark:ring-gray-700">
            <CardHeader icon={History} color="violet" title="Transaction history" subtitle="Fee is blank where no market price was entered, so it couldn't be worked out" />
            {holding.transactions.length === 0 ? (
              <p className="py-6 text-center text-sm text-gray-400 dark:text-gray-500">No buy/sell transactions recorded for this holding.</p>
            ) : (
              <div className="-mx-5 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 dark:bg-gray-900/40 text-left text-xs uppercase text-gray-500 dark:text-gray-400">
                    <tr>
                      <th className="px-5 py-3">Date</th>
                      <th className="px-5 py-3">Type</th>
                      <th className="px-5 py-3 text-right">Qty</th>
                      <th className="px-5 py-3 text-right">Price</th>
                      <th className="px-5 py-3 text-right">Fee</th>
                      <th className="px-5 py-3 text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {holding.transactions.map((t) => {
                      const isBuy = t.type === 'buy'
                      return (
                        <tr key={t.id} className="border-t border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/60">
                          <td className="whitespace-nowrap px-5 py-3 text-gray-600 dark:text-gray-400">
                            {new Date(t.occurredAt).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' })}
                          </td>
                          <td className="px-5 py-3">
                            <span className={`inline-flex items-center gap-1 text-xs font-semibold ${isBuy ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                              {isBuy ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
                              {isBuy ? 'Buy' : 'Sell'}
                            </span>
                          </td>
                          <td className="whitespace-nowrap px-5 py-3 text-right text-gray-900 dark:text-gray-100">{formatQuantity(t.quantity)}</td>
                          <td className="whitespace-nowrap px-5 py-3 text-right text-gray-600 dark:text-gray-400">{formatCurrency(t.pricePerUnit, currency)}</td>
                          <td className="whitespace-nowrap px-5 py-3 text-right text-gray-600 dark:text-gray-400">{t.fee === null ? '' : formatCurrency(t.fee, currency)}</td>
                          <td className="whitespace-nowrap px-5 py-3 text-right font-medium text-gray-900 dark:text-gray-100">
                            {formatCurrency(t.totalAmount, currency)}
                            {t.realizedGain !== null && (
                              <span className={`block text-xs ${gainClass(t.realizedGain)}`}>{signed(t.realizedGain, currency)}</span>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
