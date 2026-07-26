import PositionsWorkspace from '../../components/positions/PositionsWorkspace'

// The whole page lives in PositionsWorkspace so the Trading Desk can render the
// identical workspace under its Positions view. This route renders it unchanged.
export default function PositionsPage() {
  return <PositionsWorkspace />
}
