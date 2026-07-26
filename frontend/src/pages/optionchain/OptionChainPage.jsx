import OptionChainWorkspace from '../../components/optionchain/OptionChainWorkspace'

// The chain itself lives in OptionChainWorkspace so the trading desk's Trade tab
// renders exactly the same desk from the same code.
export default function OptionChainPage() {
  return <OptionChainWorkspace />
}
