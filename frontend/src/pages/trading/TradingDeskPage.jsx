import { useState, useEffect } from 'react'
import useMarketStore from '../../store/marketStore'
import useVirtualTrading from '../../hooks/useVirtualTrading'
import { getOptionChain } from '../../api/market'
import { getPositions, closeOrder } from '../../api/trading'
import OptionChainTable from '../../components/trading/OptionChainTable'
import OrderFormPanel from '../../components/trading/OrderFormPanel'
import { formatCurrency } from '../../utils/formatters'
import { X } from 'lucide-react'
import { useToast } from '../../components/common/Toast'

const INSTRUMENTS = ['NIFTY', 'BANKNIFTY', 'SENSEX']

const Card = ({ children, style = {} }) => (
  <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, boxShadow: '0 1px 3px rgba(0,0,0,0.05)', overflow: 'hidden', ...style }}>
    {children}
  </div>
)

const PanelHead = ({ title, right }) => (
  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderBottom: '1px solid #f1f5f9', background: '#f8fafc' }}>
    <span style={{ color: '#374151', fontSize: 13, fontWeight: 600 }}>{title}</span>
    {right}
  </div>
)

function PositionRow({ pos, onClose }) {
  const [closing, setClosing] = useState(false)
  const pnl = pos.unrealized_pnl ?? pos.net_pnl ?? 0
  const isGain = pnl >= 0
  return (
    <tr className="chain-row" style={{ borderBottom: '1px solid #f8fafc' }}>
      <td style={{ padding: '9px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <span style={{
            fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 12,
            background: pos.option_type === 'CE' ? '#eff6ff' : '#fef2f2',
            color: pos.option_type === 'CE' ? '#2563eb' : '#dc2626'
          }}>{pos.option_type}</span>
          <span className="num" style={{ color: '#1e293b', fontSize: 13, fontWeight: 600 }}>
            {pos.instrument} {pos.strike_price}
          </span>
          <span style={{ color: '#94a3b8', fontSize: 11 }}>{pos.action || 'BUY'}</span>
        </div>
        <div style={{ color: '#94a3b8', fontSize: 11, marginTop: 2 }}>{pos.quantity} lots · {pos.expiry_date || 'Weekly'}</div>
      </td>
      <td className="num" style={{ padding: '9px 10px', textAlign: 'right', color: '#64748b', fontSize: 12 }}>{pos.entry_price?.toFixed(2)}</td>
      <td className="num" style={{ padding: '9px 10px', textAlign: 'right', color: '#64748b', fontSize: 12 }}>{pos.current_price?.toFixed(2) ?? '—'}</td>
      <td className="num" style={{ padding: '9px 16px', textAlign: 'right', fontSize: 13, fontWeight: 600, color: isGain ? '#16a34a' : '#dc2626' }}>
        {isGain ? '+' : ''}{formatCurrency(pnl)}
      </td>
      <td style={{ padding: '9px 16px', textAlign: 'right' }}>
        <button onClick={async () => { setClosing(true); try { await onClose(pos.order_id || pos.id) } catch {} setClosing(false) }}
          disabled={closing}
          style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, padding: '4px 12px', cursor: 'pointer', color: '#dc2626', fontSize: 11, fontWeight: 500 }}>
          {closing ? '…' : 'Close'}
        </button>
      </td>
    </tr>
  )
}

export default function TradingDeskPage() {
  const [instrument, setInstrument] = useState('NIFTY')
  const [prefill, setPrefill] = useState(null)
  const [chainLoading, setChainLoading] = useState(false)
  const [positions, setPositions] = useState([])
  const optionChain = useMarketStore(s => s.optionChain)
  const { loadAccount } = useVirtualTrading()
  const { success } = useToast()

  const loadPositions = async () => {
    try { const r = await getPositions(); setPositions(r.data?.positions || r.data || []) } catch {}
  }

  useEffect(() => { loadAccount(); loadPositions() }, [])

  useEffect(() => {
    setChainLoading(true)
    getOptionChain(instrument)
      .then(r => useMarketStore.getState().setOptionChain(r.data))
      .catch(() => {})
      .finally(() => setChainLoading(false))
  }, [instrument])

  const handleClose = async (orderId) => {
    await closeOrder(orderId)
    success('Position closed')
    loadAccount()
    loadPositions()
  }

  const open = positions.filter(p => p.is_open || p.status === 'OPEN')
  const totalPnL = open.reduce((s, p) => s + (p.unrealized_pnl ?? 0), 0)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Instrument tabs + status */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: 3, gap: 2 }}>
          {INSTRUMENTS.map(ins => (
            <button key={ins} onClick={() => setInstrument(ins)}
              className="toggle-btn"
              style={{
                minWidth: 90, fontSize: 13,
                background: instrument === ins ? '#3b82f6' : 'transparent',
                color: instrument === ins ? '#fff' : '#64748b',
              }}>
              {ins}
            </button>
          ))}
        </div>
        {open.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ color: '#64748b', fontSize: 12 }}>Open P&L:</span>
            <span className="num" style={{ fontSize: 14, fontWeight: 600, color: totalPnL >= 0 ? '#16a34a' : '#dc2626' }}>
              {totalPnL >= 0 ? '+' : ''}{formatCurrency(totalPnL)}
            </span>
          </div>
        )}
      </div>

      {/* Main: chain + order form */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: 14, alignItems: 'start' }}>
        <Card>
          <PanelHead
            title={`Option Chain — ${instrument}`}
            right={<span style={{ color: '#94a3b8', fontSize: 11 }}>Click LTP to prefill order</span>}
          />
          <OptionChainTable
            data={optionChain} onCellClick={(s, t, l) => setPrefill({ strike: s, optionType: t, ltp: l })}
            instrument={instrument} loading={chainLoading && !optionChain}
          />
        </Card>

        <Card>
          <PanelHead
            title="Place Order"
            right={prefill && (
              <button onClick={() => setPrefill(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8' }}>
                <X size={14} />
              </button>
            )}
          />
          {prefill && (
            <div style={{ padding: '6px 16px', borderBottom: '1px solid #f1f5f9', background: '#eff6ff' }}>
              <span style={{ color: '#3b82f6', fontSize: 11 }}>
                Prefilled: {instrument} {prefill.strike} {prefill.optionType} @ {prefill.ltp?.toFixed(2)}
              </span>
            </div>
          )}
          <div style={{ padding: 16 }}>
            <OrderFormPanel prefill={prefill} instrument={instrument} onSuccess={() => { setPrefill(null); loadAccount(); loadPositions() }} />
          </div>
        </Card>
      </div>

      {/* Positions */}
      <Card>
        <PanelHead
          title={`Open Positions${open.length > 0 ? ` (${open.length})` : ''}`}
          right={open.length > 0 && (
            <span className="num" style={{ fontSize: 13, fontWeight: 600, color: totalPnL >= 0 ? '#16a34a' : '#dc2626' }}>
              {totalPnL >= 0 ? '+' : ''}{formatCurrency(totalPnL)}
            </span>
          )}
        />
        {open.length === 0 ? (
          <div style={{ padding: '24px 16px', textAlign: 'center', color: '#94a3b8', fontSize: 12 }}>
            No open positions — place an order above
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#f8fafc' }}>
                {['Position', 'Entry', 'Current', 'P&L', 'Action'].map((h, i) => (
                  <th key={h} style={{
                    padding: '8px 16px', textAlign: i >= 1 ? 'right' : 'left',
                    color: '#94a3b8', fontSize: 11, fontWeight: 600,
                    textTransform: 'uppercase', letterSpacing: '0.05em',
                    borderBottom: '1px solid #e2e8f0'
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {open.map(pos => <PositionRow key={pos.id} pos={pos} onClose={handleClose} />)}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  )
}
