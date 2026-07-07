import useMarketStore from '../../store/marketStore'

export default function MarketStatusBadge() {
  const isMarketOpen = useMarketStore(s => s.isMarketOpen)

  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      padding: '5px 12px',
      background: isMarketOpen ? 'rgba(31,193,107,0.12)' : 'rgba(233,53,68,0.12)',
      border: `1px solid ${isMarketOpen ? 'rgba(62,224,137,0.3)' : 'rgba(233,53,68,0.3)'}`,
      borderRadius: 20
    }}>
      <div style={{
        width: 7, height: 7, borderRadius: '50%',
        background: isMarketOpen ? '#3ee089' : '#e93544'
      }} />
      <span style={{
        color: isMarketOpen ? '#3ee089' : '#ff6875',
        fontSize: 12, fontWeight: 500
      }}>
        {isMarketOpen ? 'Market Open' : 'Market Closed'}
      </span>
    </div>
  )
}
