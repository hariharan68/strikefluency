import { useState, useEffect, useMemo } from 'react'
import useMarketStore from '../../store/marketStore'
import useVirtualTrading from '../../hooks/useVirtualTrading'
import { getOptionChain } from '../../api/market'
import { getPositions, closeOrder } from '../../api/trading'
import OptionChainTable from '../../components/trading/OptionChainTable'
import OrderFormPanel from '../../components/trading/OrderFormPanel'
import DisciplineModeToggle from '../../components/discipline/DisciplineModeToggle'
import useDiscipline from '../../hooks/useDiscipline'
import { formatCurrency } from '../../utils/formatters'
import { X, AlertTriangle } from 'lucide-react'
import { useToast } from '../../components/common/Toast'

const INSTRUMENTS = ['NIFTY', 'BANKNIFTY', 'SENSEX']
const WINDOWS = [5, 10, 15, 20, 'All']   // strikes to show each side of ATM

const Card = ({ children, style = {} }) => (
  <div style={{ background: 'var(--color-surface)', border: '1px solid var(--border)', borderRadius: 12, boxShadow: '0 1px 3px rgba(0,0,0,0.05)', overflow: 'hidden', ...style }}>
    {children}
  </div>
)

const PanelHead = ({ title, right }) => (
  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderBottom: '1px solid var(--border)', background: 'var(--color-surface2)' }}>
    <span style={{ color: 'var(--text)', fontSize: 13, fontWeight: 600 }}>{title}</span>
    {right}
  </div>
)

function PositionRow({ pos, onClose }) {
  const [closing, setClosing] = useState(false)
  const pnl = pos.unrealized_pnl ?? pos.net_pnl ?? 0
  const isGain = pnl >= 0
  return (
    <tr className="chain-row" style={{ borderBottom: '1px solid var(--color-surface2)' }}>
      <td style={{ padding: '9px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <span style={{
            fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 12,
            background: pos.option_type === 'CE' ? 'var(--primary-bg)' : 'var(--loss-bg)',
            color: pos.option_type === 'CE' ? 'var(--primary-dark)' : 'var(--loss)'
          }}>{pos.option_type}</span>
          <span className="num" style={{ color: 'var(--text)', fontSize: 13, fontWeight: 600 }}>
            {pos.instrument} {pos.strike_price}
          </span>
          <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>{pos.action || 'BUY'}</span>
        </div>
        <div style={{ color: 'var(--text-muted)', fontSize: 11, marginTop: 2 }}>{pos.quantity} lots · {pos.expiry_date || 'Weekly'}</div>
      </td>
      <td className="num" style={{ padding: '9px 10px', textAlign: 'right', color: 'var(--text-sub)', fontSize: 12 }}>{pos.entry_price?.toFixed(2)}</td>
      <td className="num" style={{ padding: '9px 10px', textAlign: 'right', color: 'var(--text-sub)', fontSize: 12 }}>{pos.current_price?.toFixed(2) ?? '—'}</td>
      <td className="num" style={{ padding: '9px 16px', textAlign: 'right', fontSize: 13, fontWeight: 600, color: isGain ? 'var(--gain)' : 'var(--loss)' }}>
        {isGain ? '+' : ''}{formatCurrency(pnl)}
      </td>
      <td style={{ padding: '9px 16px', textAlign: 'right' }}>
        <button onClick={async () => { setClosing(true); try { await onClose(pos.order_id || pos.id) } catch {} setClosing(false) }}
          disabled={closing}
          style={{ background: 'var(--loss-bg)', border: '1px solid var(--loss)', borderRadius: 6, padding: '4px 12px', cursor: 'pointer', color: 'var(--loss)', fontSize: 11, fontWeight: 500 }}>
          {closing ? '…' : 'Close'}
        </button>
      </td>
    </tr>
  )
}

export default function TradingDeskPage() {
  const [instrument, setInstrument] = useState('NIFTY')
  const [strikeCount, setStrikeCount] = useState(5)   // ±ATM window, default ±5
  const [prefill, setPrefill] = useState(null)
  const [chainLoading, setChainLoading] = useState(false)
  const [positions, setPositions] = useState([])
  // Select only the chain for the active tab — the WS pushes all three instruments.
  const optionChain = useMarketStore(s => s.chains[instrument]) || null

  // Trim the chain to ±strikeCount rows around ATM (or show all).
  const viewChain = useMemo(() => {
    const strikes = optionChain?.strikes
    if (!strikes?.length || strikeCount === 'All') return optionChain
    const atm = optionChain.atm_strike
    const atmIdx = strikes.reduce(
      (best, r, i) => Math.abs(r.strike - atm) < Math.abs(strikes[best].strike - atm) ? i : best, 0)
    const sliced = strikes.slice(
      Math.max(0, atmIdx - strikeCount), Math.min(strikes.length, atmIdx + strikeCount + 1))
    return { ...optionChain, strikes: sliced }
  }, [optionChain, strikeCount])
  const { loadAccount } = useVirtualTrading()
  const { mode, loadMode } = useDiscipline()
  const { success } = useToast()
  const disciplineOff = mode?.enabled === false

  const loadPositions = async () => {
    try { const r = await getPositions(); setPositions(r.data?.positions || r.data || []) } catch {}
  }

  useEffect(() => { loadAccount(); loadPositions(); loadMode() }, [])

  useEffect(() => {
    setChainLoading(true)
    setPrefill(null)   // a stale prefill from the previous instrument is invalid here
    getOptionChain(instrument)
      // REST wraps the chain as { success, data }; the WS sends it bare. Unwrap
      // so the store always holds the raw chain the table/prefill expect.
      .then(r => useMarketStore.getState().setOptionChain(r.data?.data ?? r.data))
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
        <div style={{ display: 'flex', background: 'var(--color-surface)', border: '1px solid var(--border)', borderRadius: 8, padding: 3, gap: 2 }}>
          {INSTRUMENTS.map(ins => (
            <button key={ins} onClick={() => setInstrument(ins)}
              className="toggle-btn"
              style={{
                minWidth: 90, fontSize: 13,
                background: instrument === ins ? 'var(--primary)' : 'transparent',
                color: instrument === ins ? 'var(--on-primary)' : 'var(--text-sub)',
              }}>
              {ins}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          {open.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ color: 'var(--text-sub)', fontSize: 12 }}>Open P&L:</span>
              <span className="num" style={{ fontSize: 14, fontWeight: 600, color: totalPnL >= 0 ? 'var(--gain)' : 'var(--loss)' }}>
                {totalPnL >= 0 ? '+' : ''}{formatCurrency(totalPnL)}
              </span>
            </div>
          )}
          <DisciplineModeToggle variant="compact" onChange={loadMode} />
        </div>
      </div>

      {/* Free-play banner */}
      {disciplineOff && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--warn-bg)', border: '1px solid var(--warn)', borderRadius: 10, padding: '10px 14px', color: 'var(--warn)', fontSize: 12.5, fontWeight: 600 }}>
          <AlertTriangle size={15} />
          Discipline Mode is OFF — free play. Rules are bypassed, full capital is unlocked, and these trades don't affect your discipline score.
        </div>
      )}

      {/* Main: chain + order form */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: 14, alignItems: 'start' }}>
        <Card>
          <PanelHead
            title={`Option Chain — ${instrument}`}
            right={
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span className="eyebrow" style={{ fontSize: 10 }}>Strikes ±ATM</span>
                <div style={{ display: 'flex', background: 'var(--color-surface)', border: '1px solid var(--border)', borderRadius: 8, padding: 3, gap: 2 }}>
                  {WINDOWS.map(w => (
                    <button key={w} onClick={() => setStrikeCount(w)} className="toggle-btn"
                      style={{ fontSize: 11.5, padding: '3px 9px', minWidth: 0,
                        background: strikeCount === w ? 'var(--primary)' : 'transparent',
                        color: strikeCount === w ? 'var(--on-primary)' : 'var(--text-sub)' }}>
                      {w === 'All' ? 'All' : `±${w}`}
                    </button>
                  ))}
                </div>
              </div>
            }
          />
          <OptionChainTable
            data={viewChain}
            onCellClick={(s, t, l) => setPrefill({
              strike: s, optionType: t, ltp: l,
              expiry: optionChain?.expiry, lotSize: optionChain?.lot_size,
            })}
            instrument={instrument} loading={chainLoading && !optionChain}
          />
        </Card>

        <Card>
          <PanelHead
            title="Place Order"
            right={prefill && (
              <button onClick={() => setPrefill(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>
                <X size={14} />
              </button>
            )}
          />
          {prefill && (
            <div style={{ padding: '6px 16px', borderBottom: '1px solid var(--border)', background: 'var(--primary-bg)' }}>
              <span style={{ color: 'var(--primary)', fontSize: 11 }}>
                Prefilled: {instrument} {prefill.strike} {prefill.optionType} @ {prefill.ltp?.toFixed(2)}
              </span>
            </div>
          )}
          <div style={{ padding: 16 }}>
            <OrderFormPanel prefill={prefill} instrument={instrument} disciplineOff={disciplineOff} onSuccess={() => { setPrefill(null); loadAccount(); loadPositions() }} />
          </div>
        </Card>
      </div>

      {/* Positions */}
      <Card>
        <PanelHead
          title={`Open Positions${open.length > 0 ? ` (${open.length})` : ''}`}
          right={open.length > 0 && (
            <span className="num" style={{ fontSize: 13, fontWeight: 600, color: totalPnL >= 0 ? 'var(--gain)' : 'var(--loss)' }}>
              {totalPnL >= 0 ? '+' : ''}{formatCurrency(totalPnL)}
            </span>
          )}
        />
        {open.length === 0 ? (
          <div style={{ padding: '24px 16px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>
            No open positions — place an order above
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'var(--color-surface2)' }}>
                {['Position', 'Entry', 'Current', 'P&L', 'Action'].map((h, i) => (
                  <th key={h} style={{
                    padding: '8px 16px', textAlign: i >= 1 ? 'right' : 'left',
                    color: 'var(--text-muted)', fontSize: 11, fontWeight: 600,
                    textTransform: 'uppercase', letterSpacing: '0.05em',
                    borderBottom: '1px solid var(--border)'
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
