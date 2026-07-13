export const SETUP_TAG_LABELS = {
  OI_BASED: 'OI Based',
  PRICE_ACTION: 'Price Action',
  LEVEL_TRADE: 'Level Trade',
  EXPIRY_PLAY: 'Expiry Play',
  OTHER: 'Other'
}
export const SETUP_TAGS = Object.keys(SETUP_TAG_LABELS)

export const EMOTION_LABELS = {
  CONFIDENT: { label: 'Confident', color: '#2563EB' },
  FEARFUL: { label: 'Fearful', color: '#e97d35' },
  GREEDY: { label: 'Greedy', color: '#e93544' },
  CALM: { label: 'Calm', color: '#1daf61' },
  IMPATIENT: { label: 'Impatient', color: '#f5c542' },
  FOMO: { label: 'FOMO', color: '#9b59b6' }
}

export const MISTAKE_LABELS = {
  NONE: { label: 'None', color: '#525866' },
  EARLY_EXIT: { label: 'Early Exit', color: '#e97d35' },
  SL_TOO_TIGHT: { label: 'SL Too Tight', color: '#e97d35' },
  IGNORED_LEVEL: { label: 'Ignored Level', color: '#e93544' },
  FOMO_ENTRY: { label: 'FOMO Entry', color: '#9b59b6' },
  OVERSIZE: { label: 'Oversize', color: '#e93544' }
}

export const RULE_LABELS = {
  MAX_TRADES_PER_DAY: 'Max Trades Per Day',
  MANDATORY_SL: 'Stop Loss Required',
  NO_AVERAGING_DOWN: 'No Averaging Down',
  NO_DIRECTION_FLIP: 'No Direction Flip',
  REVENGE_COOLDOWN: 'Revenge Trade Cooldown',
  MAX_DAILY_LOSS: 'Max Daily Loss Cap',
  MANDATORY_SETUP_TAG: 'Trade Setup Required'
}

export const LOT_SIZES = {
  NIFTY: 65,
  BANKNIFTY: 30,
  SENSEX: 20
}
