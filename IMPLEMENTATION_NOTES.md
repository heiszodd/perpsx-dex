# PerpsX V2 Implementation Details

## 1. CoinGecko API Integration (useLivePrices Hook)

### Overview
The app now fetches **real crypto prices** from CoinGecko's free API with no API keys required.

### Implementation (`src/hooks/useLivePrices.js`)
- **Polls every 4 seconds** for fresh price data
- **Maintains 50-point rolling history** for chart rendering
- **Graceful degradation**: Falls back to demo prices if API fails
- **No external dependencies**: Pure React hooks (useState, useEffect, useCallback)

### API Details
```javascript
// CoinGecko free API (no auth required)
const url = `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd`;

// Fetches: bitcoin, ethereum, solana
// Returns: { bitcoin: { usd: 95000 }, ethereum: { usd: 3500 }, ... }
```

### Hook Signature
```javascript
const { prices, priceHistory, isLoading, error, lastFetchTime, refreshPrices } = useLivePrices(
  symbols = ['bitcoin', 'ethereum', 'solana'],
  pollInterval = 4000,  // milliseconds
  maxHistoryPoints = 50
);
```

### Error Handling
- Logs API errors to console
- **Freezes last known price** if fetch fails
- Switches to fallback demo prices automatically
- Does NOT break the UI

### Integration in App.jsx
```javascript
// Hook call
const { prices: livePrices, priceHistory: liveHistory, error: priceError } = useLivePrices(
  ['bitcoin', 'ethereum', 'solana'],
  4000,
  50
);

// Fallback logic
const prices = (livePrices.BTC && livePrices.ETH && livePrices.SOL) ? livePrices : fallbackPrices;
const priceHistory = (liveHistory.BTC && liveHistory.BTC.length > 0) ? liveHistory : fallbackHistory;
```

---

## 2. Risk-Based Position Sizing Model

### Core Concept
**Position Size = Amount Risked (not notional size)**

When a user clicks "$50 Risk", they are betting **maximum $50 loss at liquidation**.

### Mathematics

#### Position Creation
```javascript
const riskAmount = positionSize; // e.g., $50
const leverage = 5x;
const notionalSize = riskAmount * leverage; // $250 notional exposure

// Example: LONG BTC at $95,000
// If BTC drops 20% → liquidation
// Loss = notional * 20% = $250 * 0.2 = $50 ✓
```

#### PnL Calculation
```javascript
// Standard perpetual PnL formula
pnl = (priceDiff / entryPrice) * notionalSize * direction_multiplier

// Example: Entry $95,000, Current $94,000 (SHORT 5x)
// priceDiff = $1,000
// multiplier = -1 (SHORT)
// pnl = ($1,000 / $95,000) * $250 * (-1) = -$2.63
```

#### Liquidation Price (Direction-Specific)
- **LONG**: Liquidation Price = Entry × (1 - 1/leverage)
  - Example: $95,000 × (1 - 1/5) = $76,000
  - Loss at liq: ($76,000 - $95,000) / $95,000 × $250 = -$50 ✓

- **SHORT**: Liquidation Price = Entry × (1 + 1/leverage)
  - Example: $95,000 × (1 + 1/5) = $114,000
  - Loss at liq: ($114,000 - $95,000) / $95,000 × (-$250) = -$50 ✓

#### Liquidation Detection
```javascript
// Guarantee: unrealizedPnL === -riskAmount at liquidation
const riskAmount = pos.riskAmount;
if (pnl <= -riskAmount) {
  // Liquidated - loss equals exactly the risk amount
  liquidate(pos);
}
```

### Position Object Structure
```javascript
const newPosition = {
  id: timestamp,
  market: 'BTC',
  entryPrice: currentPrice,
  direction: 'LONG' | 'SHORT',
  size: notionalSize,           // Display: what's shown on UI
  riskAmount: riskAmount,       // Internal: max loss at liq
  leverage: 5,
  initialMargin: riskAmount,    // Deducted from balance
  liquidationPrice: calculated,
  unrealizedPnL: 0,
  takeProfit: optional,
  stopLoss: optional
};
```

### Balance Mechanics
```javascript
// Opening position
balance_after = balance - riskAmount

// Closing position (profitable example)
pnl = +$15
balance_after = balance + riskAmount + pnl = balance + $65

// Closing position (loss)
pnl = -$30
balance_after = balance + riskAmount + pnl = balance + $20

// Liquidation
balance_after = balance + 0 + (-riskAmount) = balance - $50
```

### Preserved Features
✓ TP/SL triggers still work (early exit before liquidation)  
✓ Custom leverage in advanced mode  
✓ Risk modes (SAFE 2x, BALANCED 5x, DEGENERATE 10x)  
✓ Multiple simultaneous positions  

---

## 3. AlivePriceChart Component

### Overview
**Minimal, logo-style chart** that looks "alive" without full trading UI clutter.

### Component Signature
```javascript
<AlivePriceChart
  prices={priceHistory['BTC']}  // number[] of recent prices
  direction={'UP' | 'DOWN'}      // For color accent
  entryPrice={95000}             // Optional marker
  currentPrice={94500}           // Optional current marker  
  pnl={+150 or -50}              // Optional PnL value
/>
```

### Visual Features
- **No axes, grid, or labels** - pure price waveform
- **Smooth bezier curves** for organic feel
- **Gradient stroke**: Blue → Purple (UP) or Red → Orange (DOWN)
- **Glow effect** for current price marker
- **Animated pulse** on latest price point
- **Entry/Current price markers** with labels

### SVG Implementation
```javascript
// Path generation using cubic bezier curves
let path = `M ${normalizedData[0].x} ${normalizedData[0].y}`;

for (let i = 0; i < normalizedData.length - 1; i++) {
  const current = normalizedData[i];
  const next = normalizedData[i + 1];
  
  // Control points create smooth transitions
  const cp1x = current.x + (next.x - current.x) / 3;
  const cp2x = next.x - (next.x - current.x) / 3;
  
  path += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${next.x} ${next.y}`;
}
```

### Styling (Dark Mode Compatible)
- Background: None (transparent, inherits parent dark theme)
- Line stroke: 2-3px smooth curve
- Gradient: direction-dependent colors
- Glow: SVG filter for soft shadow effect

### Performance
- Uses `useMemo` to memoize path calculations
- Only recomputes when prices array changes
- Lightweight SVG rendering (no chart libraries)
- Smooth 60fps animations

---

## Testing Checklist

- [ ] CoinGecko API fetches real prices for BTC, ETH, SOL
- [ ] Price history maintains last 50 points
- [ ] Fallback demo prices work if API fails
- [ ] $10/$50/$100 buttons represent max loss (not notional)
- [ ] Liquidation loss === exactly the risk amount
- [ ] TP/SL triggers before liquidation
- [ ] Balance updates correctly on open/close/liquidate
- [ ] AlivePriceChart renders smooth waveform
- [ ] Direction colors: UP (blue→purple), DOWN (red→orange)
- [ ] Entry/Current price markers display correctly

---

## Future Enhancements

1. **Price Aggregation**: Mix CoinGecko with Binance/Kraken for redundancy
2. **Limit Order Queue**: Actually queue limit orders instead of instant fill
3. **Fee System**: Add trading fees and funding rates
4. **Chart Timeframes**: Multi-timeframe support (1m, 5m, 1h)
5. **Position History**: Store closed positions for analytics
6. **Account Stats**: Win rate, max loss, sharpe ratio
