import React, { createContext, useContext, useState, useEffect } from 'react';
import { useTradingEngine } from './hooks/useTradingEngine';
import { useLivePrices } from './hooks/useLivePrices';
import AlivePriceChart from './components/AlivePriceChart';

// Theme-aware utility
const getThemeClasses = (theme) => ({
  bg: {
    primary: theme === 'dark' ? 'bg-gray-900' : 'bg-white',
    secondary: theme === 'dark' ? 'bg-gray-800/50' : 'bg-gray-100/60',
    tertiary: theme === 'dark' ? 'bg-gray-800/30' : 'bg-gray-50/40',
  },
  text: {
    primary: theme === 'dark' ? 'text-white' : 'text-gray-900',
    secondary: theme === 'dark' ? 'text-gray-400' : 'text-gray-600',
    tertiary: theme === 'dark' ? 'text-gray-500' : 'text-gray-500',
  },
  border: theme === 'dark' ? 'border-gray-700/50' : 'border-gray-200/60',
  input: {
    bg: theme === 'dark' ? 'bg-gray-800' : 'bg-white',
    text: theme === 'dark' ? 'text-white' : 'text-gray-900',
    border: theme === 'dark' ? 'border-gray-700' : 'border-gray-300',
    placeholder: theme === 'dark' ? 'placeholder-gray-500' : 'placeholder-gray-400',
  },
  button: {
    ghost: theme === 'dark' ? 'bg-gray-800 text-gray-400 hover:bg-gray-700' : 'bg-gray-200 text-gray-600 hover:bg-gray-300',
  },
});

// Context for global state
const AppContext = createContext();

const useAppState = () => {
  // Initialize from localStorage or use defaults
  const getInitialState = () => {
    try {
      const saved = localStorage.getItem('perpsx_state');
      if (saved) {
        const parsed = JSON.parse(saved);
        console.log('✅ Loaded trading state from cache');
        return parsed;
      }
    } catch (error) {
      console.warn('⚠️ Failed to load cached state:', error);
    }
    return null;
  };

  const initialState = getInitialState();
  const [balance, setBalance] = useState(initialState?.balance ?? 1000);
  const [selectedMarket, setSelectedMarket] = useState(initialState?.selectedMarket ?? 'BTC');
  const [positions, setPositions] = useState(initialState?.positions ?? []);
  const [direction, setDirection] = useState(initialState?.direction ?? 'LONG');
  const [positionSize, setPositionSize] = useState(initialState?.positionSize ?? 50);
  const [riskMode, setRiskMode] = useState(initialState?.riskMode ?? 'BALANCED');
  const [showAdvanced, setShowAdvanced] = useState(initialState?.showAdvanced ?? false);
  const [theme, setTheme] = useState(initialState?.theme ?? 'dark');
  const [advancedSettings, setAdvancedSettings] = useState(
    initialState?.advancedSettings ?? {
      orderType: 'MARKET',
      limitPrice: '',
      customLeverage: '',
      takeProfit: '',
      stopLoss: ''
    }
  );

  // Use Kraken free API for live prices (polls every 1 second for real-time sync, 4 hours history)
  const { prices: livePrices, priceHistory: liveHistory, highLow: liveHighLow, error: priceError } = useLivePrices(
    ['bitcoin', 'ethereum', 'solana'],
    1000,
    14400  // 4 hours at 1-second intervals
  );
  
  // Fallback to local state if API fails
  const [fallbackPrices, setFallbackPrices] = useState({
    BTC: 95000,
    ETH: 3500,
    SOL: 140
  });
  const [fallbackHistory, setFallbackHistory] = useState({
    BTC: [95000],
    ETH: [3500],
    SOL: [140]
  });
  
  // Use live prices if available, fallback otherwise
  const prices = (livePrices.BTC && livePrices.ETH && livePrices.SOL) ? livePrices : fallbackPrices;
  const priceHistory = (liveHistory.BTC && liveHistory.BTC.length > 0) ? liveHistory : fallbackHistory;

  // Map risk modes to leverage
  const leverageMap = {
    SAFE: 2,
    BALANCED: 5,
    DEGENERATE: 10
  };

  // Calculate total margin used by open positions
  const totalMarginUsed = positions.reduce((sum, pos) => sum + pos.initialMargin, 0);
  const availableMargin = balance - totalMarginUsed;

  // Auto-save state to localStorage
  useEffect(() => {
    const stateToSave = {
      balance,
      selectedMarket,
      positions,
      direction,
      positionSize,
      riskMode,
      showAdvanced,
      theme,
      advancedSettings,
      lastSaved: new Date().toISOString()
    };
    
    try {
      localStorage.setItem('perpsx_state', JSON.stringify(stateToSave));
    } catch (error) {
      console.warn('⚠️ Failed to save state to cache:', error);
    }
  }, [balance, selectedMarket, positions, direction, positionSize, riskMode, showAdvanced, theme, advancedSettings]);
  useEffect(() => {
    if (priceError) {
      console.warn('⚠️ CoinGecko API error - using demo prices:', priceError);
    }
  }, [priceError]);
  
  // Add slight random jitter to fallback prices for demo mode
  useEffect(() => {
    const interval = setInterval(() => {
      if (!livePrices.BTC || !livePrices.ETH || !livePrices.SOL) {
        // Only add jitter if using fallback prices (live prices already updating via API)
        setFallbackPrices(prev => ({
          BTC: prev.BTC * (1 + (Math.random() - 0.5) * 0.0005),
          ETH: prev.ETH * (1 + (Math.random() - 0.5) * 0.0005),
          SOL: prev.SOL * (1 + (Math.random() - 0.5) * 0.0005)
        }));
        
        setFallbackHistory(prevHistory => ({
          BTC: [...prevHistory.BTC, fallbackPrices.BTC].slice(-50),
          ETH: [...prevHistory.ETH, fallbackPrices.ETH].slice(-50),
          SOL: [...prevHistory.SOL, fallbackPrices.SOL].slice(-50)
        }));
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [livePrices.BTC, livePrices.ETH, livePrices.SOL, fallbackPrices]);

  // Update unrealized PnL for all positions
  useEffect(() => {
    if (positions.length > 0 && prices.BTC) {
      setPositions(prevPositions => {
        const closedPositions = [];

        // In one pass: update PnL, detect closures, collect closed positions
        const updatedPositions = prevPositions.map(pos => {
          const currentPrice = prices[pos.market];
          const priceDiff = currentPrice - pos.entryPrice;
          const multiplier = pos.direction === 'LONG' ? 1 : -1;
          // pos.size is now notional size (riskAmount * leverage), so no need to multiply by leverage again
          const pnl = (priceDiff / pos.entryPrice) * pos.size * multiplier;

          // Check take profit
          if (pos.takeProfit) {
            const tpHit = pos.direction === 'LONG'
              ? currentPrice >= pos.takeProfit
              : currentPrice <= pos.takeProfit;
            if (tpHit) {
              const closedPos = { ...pos, unrealizedPnL: pnl, closedByTP: true };
              closedPositions.push(closedPos);
              return closedPos;
            }
          }

          // Check stop loss
          if (pos.stopLoss) {
            const slHit = pos.direction === 'LONG'
              ? currentPrice <= pos.stopLoss
              : currentPrice >= pos.stopLoss;
            if (slHit) {
              const closedPos = { ...pos, unrealizedPnL: pnl, closedBySL: true };
              closedPositions.push(closedPos);
              return closedPos;
            }
          }

          // Check liquidation: loss equals exactly the risk amount at liquidation
          // unrealizedPnL = (priceDiff / entryPrice) * notionalSize * multiplier
          // At liquidation: unrealizedPnL = -riskAmount (since notionalSize = riskAmount * leverage)
          const riskAmount = pos.riskAmount || pos.initialMargin;
          if (pnl <= -riskAmount) {
            const closedPos = { ...pos, unrealizedPnL: -riskAmount, liquidated: true };
            closedPositions.push(closedPos);
            return closedPos;
          }

          return { ...pos, unrealizedPnL: pnl };
        });

        // Externally compute balance adjustments from closed positions
        if (closedPositions.length > 0) {
          const totalReturn = closedPositions.reduce((sum, p) => {
            if (p.liquidated) {
              // For liquidation: only add PnL (negative)
              return sum + p.unrealizedPnL;
            }
            // For TP/SL: only add PnL (margin not deducted)
            return sum + p.unrealizedPnL;
          }, 0);
          setBalance(b => b + totalReturn);

          // Log liquidation events
          closedPositions.forEach(p => {
            if (p.liquidated) {
              console.log(`💥 Position liquidated! ${p.direction} ${p.size} at ${p.leverage}x leverage. Loss: $${p.unrealizedPnL.toFixed(2)}`);
            }
          });
        }

        // Return only open positions (filter out closed ones)
        return updatedPositions.filter(pos => !pos.liquidated && !pos.closedByTP && !pos.closedBySL);
      });
    }
  }, [prices]);

  const openPosition = () => {
    const currentPrice = prices[selectedMarket];
    if (!currentPrice) return;

    // Use custom leverage if advanced mode is on and leverage is set, otherwise use risk mode
    const customLev = showAdvanced && advancedSettings.customLeverage ? parseFloat(advancedSettings.customLeverage) : null;
    const leverage = customLev && customLev > 0 ? customLev : leverageMap[riskMode];

    const initialMargin = positionSize / leverage;

    // Check if balance is sufficient
    if (balance < initialMargin) {
      console.log(`❌ Insufficient balance. Required: $${initialMargin.toFixed(2)}, Available: $${balance.toFixed(2)}`);
      return;
    }

    // For limit orders, check if price needs to be triggered
    if (advancedSettings.orderType === 'LIMIT' && advancedSettings.limitPrice) {
      const limitPrice = parseFloat(advancedSettings.limitPrice);
      // In real app, this would be queued. For demo, we'll just use limit as entry
      const entryPrice = limitPrice;

      const riskAmount = positionSize; // positionSize now represents risk amount
      const notionalSize = riskAmount * leverage;
      const margin = riskAmount; // margin equals risk amount
      const maintenanceMargin = 0; // no maintenance margin, liquidation at full loss
      const liquidationPrice = direction === 'LONG'
        ? entryPrice * (1 - 1/leverage) // lose full margin at liquidation
        : entryPrice * (1 + 1/leverage);

      const newPosition = {
        id: Date.now(),
        market: selectedMarket,
        entryPrice: entryPrice,
        direction,
        size: notionalSize, // display notional size
        riskAmount, // store risk amount separately
        riskMode: showAdvanced ? 'CUSTOM' : riskMode,
        leverage,
        initialMargin: margin,
        maintenanceMargin,
        marginUsed: margin,
        liquidationPrice,
        unrealizedPnL: 0,
        openedAt: new Date().toLocaleTimeString(),
        takeProfit: advancedSettings.takeProfit ? parseFloat(advancedSettings.takeProfit) : null,
        stopLoss: advancedSettings.stopLoss ? parseFloat(advancedSettings.stopLoss) : null
      };

      // Atomic state update: add position (margin not deducted - only unrealized gains count)
      setPositions(prev => [...prev, newPosition]);
      console.log(`✅ Opened ${direction} position: ${notionalSize} at ${leverage}x leverage. Risk: $${riskAmount.toFixed(2)}`);
      return;
    }

    // Market order
    const riskAmount = positionSize; // positionSize now represents risk amount
    const notionalSize = riskAmount * leverage;
    const margin = riskAmount; // margin equals risk amount
    const maintenanceMargin = 0; // no maintenance margin, liquidation at full loss
    const liquidationPrice = direction === 'LONG'
      ? currentPrice * (1 - 1/leverage) // lose full margin at liquidation
      : currentPrice * (1 + 1/leverage);

    const newPosition = {
      id: Date.now(),
      market: selectedMarket,
      entryPrice: currentPrice,
      direction,
      size: notionalSize, // display notional size
      riskAmount, // store risk amount separately
      riskMode: showAdvanced ? 'CUSTOM' : riskMode,
      leverage,
      initialMargin: margin,
      maintenanceMargin,
      marginUsed: margin,
      liquidationPrice,
      unrealizedPnL: 0,
      openedAt: new Date().toLocaleTimeString(),
      takeProfit: advancedSettings.takeProfit ? parseFloat(advancedSettings.takeProfit) : null,
      stopLoss: advancedSettings.stopLoss ? parseFloat(advancedSettings.stopLoss) : null
    };

    // Atomic state update: add position (margin not deducted - only unrealized gains count)
    setPositions(prev => [...prev, newPosition]);
    console.log(`✅ Opened ${direction} position: ${notionalSize} at ${leverage}x leverage. Risk: $${riskAmount.toFixed(2)}`);
  };

  const closePosition = (positionId) => {
    const position = positions.find(p => p.id === positionId);
    if (!position) return;

    const pnl = position.unrealizedPnL;

    // Atomic state update: add PnL only (margin was never deducted) and remove position
    setBalance(prev => prev + pnl);
    setPositions(prev => prev.filter(p => p.id !== positionId));

    console.log(`✅ Closed ${position.direction} position: ${position.size} at ${position.leverage}x leverage. Margin returned: $${margin.toFixed(2)}, PnL: ${pnl >= 0 ? '+' : ''}$${pnl.toFixed(2)}`);
  };

  const closeAllPositions = () => {
    const totalPnL = positions.reduce((sum, pos) => sum + pos.unrealizedPnL, 0);

    // Atomic state update: add total PnL only (margin was never deducted) and clear positions
    setBalance(prev => prev + totalPnL);
    setPositions([]);

    console.log(`✅ Closed all positions. Total margin returned: $${totalMargin.toFixed(2)}, Total PnL: ${totalPnL >= 0 ? '+' : ''}$${totalPnL.toFixed(2)}`);
  };

  const resetState = () => {
    if (window.confirm('🔄 Clear all data and reset to defaults? This cannot be undone.')) {
      try {
        localStorage.removeItem('perpsx_state');
        console.log('✅ Cache cleared');
        // Reload page to reset all state
        window.location.reload();
      } catch (error) {
        console.error('Failed to clear cache:', error);
      }
    }
  };

  return {
    balance,
    prices,
    priceHistory,
    livePrices,
    liveHighLow,
    selectedMarket,
    setSelectedMarket,
    positions,
    direction,
    setDirection,
    positionSize,
    setPositionSize,
    riskMode,
    setRiskMode,
    showAdvanced,
    setShowAdvanced,
    theme,
    setTheme,
    advancedSettings,
    setAdvancedSettings,
    openPosition,
    closePosition,
    closeAllPositions,
    resetState
  };
};

// Components
const Header = ({ balance, positions, onReset, theme, onThemeChange, totalMarginUsed }) => {
  const totalUnrealizedPnL = positions.reduce((sum, pos) => sum + pos.unrealizedPnL, 0);
  const liveBalance = balance + totalUnrealizedPnL;
  const balanceColor = totalUnrealizedPnL >= 0 ? 'text-green-500' : 'text-red-500';
  
  return (
    <div className="flex justify-between items-center mb-8">
      <div>
        <h1 className="text-2xl font-bold">PerpsX</h1>
        <span className="text-xs uppercase tracking-wider opacity-60">Demo Mode</span>
      </div>
      <div className="text-right">
        <div className="text-xs opacity-60 mb-1">Demo Balance</div>
        <div className={`text-2xl font-bold transition-colors ${positions.length > 0 ? balanceColor : ''}`}>
          ${liveBalance.toFixed(2)}
        </div>
        {positions.length > 0 && (
          <div className="text-xs opacity-60 mt-1">
            Margin Available: ${(balance - totalMarginUsed).toFixed(2)}
          </div>
        )}
        <div className="flex gap-2 mt-2 justify-end">
          <button
            onClick={() => onThemeChange(theme === 'dark' ? 'light' : 'dark')}
            className="text-xs px-2 py-1 rounded opacity-70 hover:opacity-100 transition-opacity"
            title="Toggle theme"
          >
            {theme === 'dark' ? '☀️' : '🌙'}
          </button>
          <button
            onClick={onReset}
            className="text-xs opacity-70 hover:opacity-100 transition-opacity"
            title="Clear all data and reset to defaults"
          >
            Reset
          </button>
        </div>
      </div>
    </div>
  );
};

const MarketSelector = ({ selectedMarket, setSelectedMarket, prices }) => {
  const markets = ['BTC', 'ETH', 'SOL'];
  
  return (
    <div className="mb-6">
      <div className="grid grid-cols-3 gap-3">
        {markets.map(market => (
          <button
            key={market}
            onClick={() => setSelectedMarket(market)}
            className={`py-4 px-4 rounded-2xl font-semibold transition-all duration-300 ease-smooth transform hover:scale-105 active:scale-95 ${
              selectedMarket === market
                ? 'bg-blue-500 text-white shadow-lg shadow-blue-500/50 scale-105'
                : 'bg-gray-800 text-gray-400 hover:bg-gray-700 hover:shadow-lg hover:shadow-gray-700/30'
            }`}
          >
            <div className="text-xs font-semibold opacity-90">{market}-USDT</div>
            <div className="text-sm font-bold mt-1">
              {prices[market] ? `$${Number(prices[market]).toFixed(2)}` : '...'}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
};

const MarketPrice = ({ market, price, isLive = true }) => (
  <div className="mb-8">
    <div className="flex items-center justify-between mb-2">
      <div className="text-sm text-gray-500">{market}-USDT</div>
      <div className={`text-xs px-2 py-1 rounded ${
        isLive 
          ? 'bg-green-500/20 text-green-400' 
          : 'bg-yellow-500/20 text-yellow-400'
      }`}>
        {isLive ? '🟢 LIVE' : '🟡 DEMO'}
      </div>
    </div>
    <div className="text-4xl font-bold text-white">
      {price ? `$${Number(price).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '...'}
    </div>
  </div>
);

const DirectionSelector = ({ direction, setDirection }) => (
  <div className="mb-6">
    <div className="text-sm text-gray-500 mb-3">Direction</div>
    <div className="grid grid-cols-2 gap-4">
      <button
        onClick={() => setDirection('LONG')}
        className={`py-4 rounded-2xl font-bold text-lg transition-all duration-300 ease-smooth transform hover:scale-105 active:scale-95 ${
          direction === 'LONG'
            ? 'bg-gradient-to-r from-green-500 to-emerald-600 text-white shadow-lg shadow-green-500/50 scale-105'
            : 'bg-gray-800 text-gray-400 hover:bg-gray-700 hover:shadow-lg'
        }`}
      >
        LONG
      </button>
      <button
        onClick={() => setDirection('SHORT')}
        className={`py-4 rounded-2xl font-bold text-lg transition-all duration-300 ease-smooth transform hover:scale-105 active:scale-95 ${
          direction === 'SHORT'
            ? 'bg-gradient-to-r from-red-500 to-red-600 text-white shadow-lg shadow-red-500/50 scale-105'
            : 'bg-gray-800 text-gray-400 hover:bg-gray-700 hover:shadow-lg'
        }`}
      >
        SHORT
      </button>
    </div>
  </div>
);

const PositionSizeSelector = ({ positionSize, setPositionSize }) => {
  const sizes = [10, 50, 100];
  
  return (
    <div className="mb-6">
      <div className="text-sm text-gray-500 mb-3">Risk Amount</div>
      <div className="grid grid-cols-3 gap-3">
        {sizes.map(size => (
          <button
            key={size}
            onClick={() => setPositionSize(size)}
            className={`py-4 rounded-2xl font-bold transition-all duration-300 ease-smooth transform hover:scale-105 active:scale-95 ${
              positionSize === size
                ? 'bg-blue-500 text-white shadow-lg shadow-blue-500/50 scale-105'
                : 'bg-gray-800 text-gray-400 hover:bg-gray-700 hover:shadow-lg'
            }`}
          >
            ${size}
          </button>
        ))}
      </div>
    </div>
  );
};

const RiskModeSelector = ({ riskMode, setRiskMode, showAdvanced }) => {
  if (showAdvanced) return null;

  const modes = [
    { name: 'SAFE', color: 'green' },
    { name: 'BALANCED', color: 'yellow' },
    { name: 'DEGENERATE', color: 'red' }
  ];

  return (
    <div className="mb-8">
      <div className="text-sm text-gray-500 mb-3">Risk Mode</div>
      <div className="grid grid-cols-3 gap-3">
        {modes.map(mode => (
          <button
            key={mode.name}
            onClick={() => setRiskMode(mode.name)}
            className={`py-4 rounded-2xl font-bold transition-all duration-300 ease-smooth transform hover:scale-105 active:scale-95 ${
              riskMode === mode.name
                ? 'text-white shadow-lg scale-105'
                : 'bg-gray-800 text-gray-400 hover:bg-gray-700 hover:shadow-lg'
            }`}
            style={riskMode === mode.name ? {
              backgroundColor: mode.color === 'green' ? '#10b981' : mode.color === 'yellow' ? '#f59e0b' : '#ef4444',
              boxShadow: `0 15px 40px -10px ${mode.color === 'green' ? 'rgba(16, 185, 129, 0.6)' : mode.color === 'yellow' ? 'rgba(245, 158, 11, 0.6)' : 'rgba(239, 68, 68, 0.6)'}`
            } : {}}
          >
            {mode.name}
          </button>
        ))}
      </div>
    </div>
  );
};

const AdvancedToggle = ({ showAdvanced, setShowAdvanced }) => (
  <div className="mb-6">
    <button
      onClick={() => setShowAdvanced(!showAdvanced)}
      className="w-full py-4 rounded-2xl bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-gray-300 transition-all duration-300 ease-smooth transform hover:scale-105 active:scale-95 text-sm font-semibold shadow-md hover:shadow-lg"
    >
      {showAdvanced ? '← Back to Simple' : 'Advanced Options →'}
    </button>
  </div>
);

const AdvancedSettings = ({ advancedSettings, setAdvancedSettings, selectedMarket, prices, direction, positionSize, riskMode }) => {
  const currentPrice = prices[selectedMarket];
  
  const leverageMap = {
    SAFE: 2,
    BALANCED: 5,
    DEGENERATE: 10
  };
  
  const leverage = advancedSettings.customLeverage 
    ? parseFloat(advancedSettings.customLeverage) 
    : leverageMap[riskMode];
  
  const entryPrice = advancedSettings.orderType === 'LIMIT' && advancedSettings.limitPrice
    ? parseFloat(advancedSettings.limitPrice)
    : currentPrice;
  
  // Calculate PnL at Take Profit price
  const calculateTPPnL = () => {
    if (!advancedSettings.takeProfit || !entryPrice) return null;
    const tp = parseFloat(advancedSettings.takeProfit);
    const priceDiff = tp - entryPrice;
    const multiplier = direction === 'LONG' ? 1 : -1;
    const notionalSize = positionSize * leverage; // positionSize is now riskAmount
    return (priceDiff / entryPrice) * notionalSize * multiplier;
  };

  // Calculate PnL at Stop Loss price
  const calculateSLPnL = () => {
    if (!advancedSettings.stopLoss || !entryPrice) return null;
    const sl = parseFloat(advancedSettings.stopLoss);
    const priceDiff = sl - entryPrice;
    const multiplier = direction === 'LONG' ? 1 : -1;
    const notionalSize = positionSize * leverage; // positionSize is now riskAmount
    return (priceDiff / entryPrice) * notionalSize * multiplier;
  };
  
  const tpPnL = calculateTPPnL();
  const slPnL = calculateSLPnL();

  return (
    <div className="mb-8 space-y-4">
      {/* Order Type */}
      <div>
        <div className="text-sm text-gray-400 mb-3 font-medium">Order Type</div>
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={() => setAdvancedSettings(prev => ({ ...prev, orderType: 'MARKET' }))}
            className={`py-3 rounded-2xl font-bold transition-all duration-300 ease-smooth transform hover:scale-105 active:scale-95 ${
              advancedSettings.orderType === 'MARKET'
                ? 'bg-blue-500 text-white shadow-lg shadow-blue-500/50'
                : 'bg-gray-800 text-gray-400 hover:bg-gray-700 hover:shadow-lg'
            }`}
          >
            Market
          </button>
          <button
            onClick={() => setAdvancedSettings(prev => ({ ...prev, orderType: 'LIMIT' }))}
            className={`py-3 rounded-2xl font-bold transition-all duration-300 ease-smooth transform hover:scale-105 active:scale-95 ${
              advancedSettings.orderType === 'LIMIT'
                ? 'bg-blue-500 text-white shadow-lg shadow-blue-500/50'
                : 'bg-gray-800 text-gray-400 hover:bg-gray-700 hover:shadow-lg'
            }`}
          >
            Limit
          </button>
        </div>
      </div>

      {/* Limit Price */}
      {advancedSettings.orderType === 'LIMIT' && (
        <div className="animate-float-in">
          <div className="text-sm text-gray-400 mb-2 font-medium">Limit Entry Price</div>
          <input
            type="number"
            value={advancedSettings.limitPrice}
            onChange={(e) => setAdvancedSettings(prev => ({ ...prev, limitPrice: e.target.value }))}
            placeholder={currentPrice ? `Current: $${currentPrice.toFixed(2)}` : 'Enter price'}
            className="w-full py-3 px-4 rounded-2xl bg-gray-800 text-white placeholder-gray-500 border border-gray-700 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30 focus:outline-none transition-all duration-200"
          />
        </div>
      )}
      {/* Custom Leverage Slider */}
      <div>
        <div className="text-sm text-gray-400 mb-3 font-medium">Custom Leverage</div>
        <div className="flex items-center gap-4">
          <input
            type="range"
            min="1"
            max="200"
            value={advancedSettings.customLeverage || leverageMap[riskMode] || 5}
            onChange={(e) => setAdvancedSettings(prev => ({ ...prev, customLeverage: e.target.value }))}
            className="flex-1 h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
          />
          <div className="text-xl font-bold text-blue-400 min-w-max">
            {advancedSettings.customLeverage ? `${Math.round(advancedSettings.customLeverage)}x` : `${leverageMap[riskMode]}x`}
          </div>
        </div>
        <div className="text-xs text-gray-500 mt-2">Range: 1x - 200x</div>
      </div>

      {/* Take Profit */}
      <div>
        <div className="text-sm text-gray-400 mb-2 font-medium">Take Profit Price (Optional)</div>
        <input
          type="number"
          value={advancedSettings.takeProfit}
          onChange={(e) => setAdvancedSettings(prev => ({ ...prev, takeProfit: e.target.value }))}
          placeholder="Auto-close at profit"
          className="w-full py-3 px-4 rounded-2xl bg-gray-800 text-white placeholder-gray-500 border border-gray-700 focus:border-green-500 focus:ring-2 focus:ring-green-500/30 focus:outline-none transition-all duration-200"
        />
        {tpPnL !== null && (
          <div className={`text-xs mt-3 font-bold animate-pulse-soft ${tpPnL >= 0 ? 'text-green-400' : 'text-red-400'}`}>
            PnL at TP: {tpPnL >= 0 ? '+' : ''}${tpPnL.toFixed(2)}
          </div>
        )}
      </div>

      {/* Stop Loss */}
      <div>
        <div className="text-sm text-gray-400 mb-2 font-medium">Stop Loss Price (Optional)</div>
        <input
          type="number"
          value={advancedSettings.stopLoss}
          onChange={(e) => setAdvancedSettings(prev => ({ ...prev, stopLoss: e.target.value }))}
          placeholder="Auto-close at loss"
          className="w-full py-3 px-4 rounded-2xl bg-gray-800 text-white placeholder-gray-500 border border-gray-700 focus:border-red-500 focus:ring-2 focus:ring-red-500/30 focus:outline-none transition-all duration-200"
        />
        {slPnL !== null && (
          <div className={`text-xs mt-3 font-bold animate-pulse-soft ${slPnL >= 0 ? 'text-green-400' : 'text-red-400'}`}>
            PnL at SL: {slPnL >= 0 ? '+' : ''}${slPnL.toFixed(2)}
          </div>
        )}
      </div>
    </div>
  );
};

const ActionButtons = ({ openPosition, selectedMarket, prices, direction, positionSize, riskMode, showAdvanced, advancedSettings }) => {
  const leverageMap = {
    SAFE: 2,
    BALANCED: 5,
    DEGENERATE: 10
  };

  const currentPrice = prices[selectedMarket];
  const leverage = showAdvanced && advancedSettings.customLeverage 
    ? parseFloat(advancedSettings.customLeverage) 
    : leverageMap[riskMode];

  const entryPrice = advancedSettings.orderType === 'LIMIT' && advancedSettings.limitPrice
    ? parseFloat(advancedSettings.limitPrice)
    : currentPrice;

  const liquidationPrice = entryPrice && direction === 'LONG'
    ? entryPrice * (1 - 1/leverage) // lose full risk amount at liquidation
    : entryPrice && entryPrice * (1 + 1/leverage);

  return (
    <div className="mb-8 space-y-4">
      {entryPrice && (
        <div className="bg-gradient-to-br from-gray-900/80 to-gray-800/40 rounded-3xl p-5 mb-4 border border-gray-700/50 backdrop-blur-sm shadow-lg transition-all duration-300">
          <div className="flex justify-between items-center text-sm mb-3">
            <span className="text-gray-400">Entry Price</span>
            <span className="text-white font-bold">${Number(entryPrice).toFixed(2)}</span>
          </div>
          <div className="flex justify-between items-center text-sm mb-3">
            <span className="text-gray-400">Leverage</span>
            <span className="text-white font-bold">{leverage}x</span>
          </div>
          <div className="flex justify-between items-center text-sm pb-3 border-b border-gray-700/30">
            <span className="text-gray-400">Liquidation Price</span>
            <span className="text-red-400 font-bold">${Number(liquidationPrice).toFixed(2)}</span>
          </div>
          {advancedSettings.takeProfit && (
            <div className="flex justify-between items-center text-sm mt-3 pt-3 border-t border-gray-700/30">
              <span className="text-gray-400">Take Profit</span>
              <span className="text-green-400 font-bold">${parseFloat(advancedSettings.takeProfit).toFixed(2)}</span>
            </div>
          )}
          {advancedSettings.stopLoss && (
            <div className="flex justify-between items-center text-sm mt-3">
              <span className="text-gray-400">Stop Loss</span>
              <span className="text-red-400 font-bold">${parseFloat(advancedSettings.stopLoss).toFixed(2)}</span>
            </div>
          )}
        </div>
      )}
      <button
        onClick={openPosition}
        className="w-full py-5 rounded-3xl bg-gradient-to-r from-blue-500 via-purple-600 to-pink-600 text-white font-bold text-lg shadow-2xl shadow-purple-600/50 hover:shadow-3xl hover:shadow-purple-600/70 transition-all duration-300 ease-smooth transform hover:scale-105 active:scale-95 hover:-translate-y-1 relative overflow-hidden group"
      >
        <span className="relative z-10">Open Trade</span>
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-500"></div>
      </button>
    </div>
  );
};

const PositionCard = ({ position, closePosition }) => {
  const pnlColor = position.unrealizedPnL >= 0 ? 'text-green-500' : 'text-red-500';

  return (
    <div className="bg-gradient-to-br from-gray-900/80 to-gray-800/40 rounded-3xl p-5 border border-gray-700/50 mb-3 backdrop-blur-sm shadow-lg hover:shadow-2xl transition-all duration-300 hover:border-gray-600/50 transform hover:scale-102">
      <div className="flex justify-between items-start mb-4">
        <div>
          <div className="text-xs text-gray-400 uppercase tracking-wider">{position.market}-USDT</div>
          <div className={`text-xl font-bold mt-1 ${position.direction === 'LONG' ? 'text-green-500' : 'text-red-500'}`}>
            {position.direction} ${position.size}
          </div>
        </div>
        <button
          onClick={() => closePosition(position.id)}
          className="px-4 py-2 bg-gradient-to-br from-gray-700 to-gray-800 hover:from-gray-600 hover:to-gray-700 rounded-2xl text-sm font-semibold transition-all duration-300 transform hover:scale-105 active:scale-95 shadow-md hover:shadow-lg"
        >
          Close
        </button>
      </div>

      <div className="grid grid-cols-3 gap-3 mb-4">
        <div className="bg-gray-800/40 rounded-2xl p-3">
          <div className="text-xs text-gray-400 mb-1">Entry</div>
          <div className="text-sm font-bold text-white">
            ${Number(position.entryPrice).toFixed(2)}
          </div>
        </div>
        <div className="bg-gray-800/40 rounded-2xl p-3">
          <div className="text-xs text-gray-400 mb-1">Leverage</div>
          <div className="text-sm font-bold text-white">{position.leverage}x</div>
        </div>
        <div className="bg-gray-800/40 rounded-2xl p-3">
          <div className="text-xs text-gray-400 mb-1">Time</div>
          <div className="text-sm font-bold text-white">{position.openedAt}</div>
        </div>
      </div>

      {(position.takeProfit || position.stopLoss) && (
        <div className="bg-gradient-to-br from-gray-800/50 to-gray-700/30 rounded-2xl p-3 mb-4 text-xs space-y-2 border border-gray-700/30">
          {position.takeProfit && (
            <div className="flex justify-between items-center">
              <span className="text-gray-400">Take Profit</span>
              <span className="text-green-400 font-bold">${position.takeProfit.toFixed(2)}</span>
            </div>
          )}
          {position.stopLoss && (
            <div className="flex justify-between items-center">
              <span className="text-gray-400">Stop Loss</span>
              <span className="text-red-400 font-bold">${position.stopLoss.toFixed(2)}</span>
            </div>
          )}
        </div>
      )}

      <div className="border-t border-gray-700/30 pt-4">
        <div className="flex justify-between items-center mb-2">
          <div className="text-sm text-gray-400">PnL</div>
          <div className={`text-2xl font-bold ${pnlColor}`}>
            {position.unrealizedPnL >= 0 ? '+' : ''}${position.unrealizedPnL.toFixed(2)}
          </div>
        </div>
        <div className="text-xs text-gray-500">
          Liq: <span className="text-red-400 font-bold">${Number(position.liquidationPrice).toFixed(2)}</span>
        </div>
      </div>
    </div>
  );
};

const PositionsList = ({ positions, closePosition, closeAllPositions }) => {
  if (positions.length === 0) return null;

  const totalPnL = positions.reduce((sum, pos) => sum + pos.unrealizedPnL, 0);
  const pnlColor = totalPnL >= 0 ? 'text-green-500' : 'text-red-500';

  return (
    <div className="mb-8">
      <div className="flex justify-between items-center mb-4">
        <div>
          <div className="text-sm text-gray-400">
            Active Positions ({positions.length})
          </div>
          <div className={`text-lg font-bold ${pnlColor}`}>
            Total: {totalPnL >= 0 ? '+' : ''}${totalPnL.toFixed(2)}
          </div>
        </div>
        <button
          onClick={closeAllPositions}
          className="px-5 py-2 bg-gradient-to-r from-red-600 to-red-700 hover:from-red-500 hover:to-red-600 rounded-2xl text-sm font-bold transition-all duration-300 transform hover:scale-105 active:scale-95 shadow-lg hover:shadow-xl hover:shadow-red-600/50"
        >
          Close All
        </button>
      </div>
      
      <div className="space-y-4">
        {positions.map(position => (
          <PositionCard 
            key={position.id} 
            position={position} 
            closePosition={closePosition}
          />
        ))}
      </div>
    </div>
  );
};

const App = () => {
  const state = useAppState();
  
  // Calculate total margin used (same calculation as in useAppState)
  const totalMarginUsed = state.positions.reduce((sum, pos) => sum + pos.initialMargin, 0);
  
  // Apply theme to document
  useEffect(() => {
    const isDark = state.theme === 'dark';
    if (isDark) {
      document.documentElement.classList.remove('light');
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
      document.documentElement.classList.add('light');
    }
  }, [state.theme]);

  return (
    <AppContext.Provider value={state}>
      <div className={`min-h-screen transition-colors duration-300 ${
        state.theme === 'dark'
          ? 'bg-gradient-to-br from-gray-950 via-gray-900 to-black text-white'
          : 'bg-gradient-to-br from-gray-50 via-white to-gray-100 text-gray-900'
      }`}>
        {/* Mobile / Portrait Layout */}
        <div className="lg:hidden max-w-md mx-auto p-6 py-8">
          <Header balance={state.balance} positions={state.positions} onReset={state.resetState} theme={state.theme} onThemeChange={state.setTheme} totalMarginUsed={totalMarginUsed} />
          <MarketSelector 
            selectedMarket={state.selectedMarket}
            setSelectedMarket={state.setSelectedMarket}
            prices={state.prices}
          />
          <MarketPrice
            market={state.selectedMarket}
            price={state.prices[state.selectedMarket]}
            isLive={!!(state.livePrices.BTC && state.livePrices.ETH && state.livePrices.SOL)}
          />
          <AlivePriceChart
            prices={state.priceHistory[state.selectedMarket]}
            direction={state.direction === 'LONG' ? 'UP' : 'DOWN'}
            entryPrice={state.positions.length > 0 ? state.positions[0].entryPrice : null}
            currentPrice={state.prices[state.selectedMarket]}
            pnl={state.positions.length > 0 ? state.positions[0].unrealizedPnL : 0}
            highLow={state.liveHighLow[state.selectedMarket]}
          />
          <DirectionSelector
            direction={state.direction}
            setDirection={state.setDirection}
          />
          <PositionSizeSelector 
            positionSize={state.positionSize} 
            setPositionSize={state.setPositionSize}
          />
          <RiskModeSelector 
            riskMode={state.riskMode} 
            setRiskMode={state.setRiskMode}
            showAdvanced={state.showAdvanced}
          />
          <AdvancedToggle 
            showAdvanced={state.showAdvanced}
            setShowAdvanced={state.setShowAdvanced}
          />
          {state.showAdvanced && (
            <AdvancedSettings
              advancedSettings={state.advancedSettings}
              setAdvancedSettings={state.setAdvancedSettings}
              selectedMarket={state.selectedMarket}
              prices={state.prices}
              direction={state.direction}
              positionSize={state.positionSize}
              riskMode={state.riskMode}
            />
          )}
          <ActionButtons 
            openPosition={state.openPosition}
            selectedMarket={state.selectedMarket}
            prices={state.prices}
            direction={state.direction}
            positionSize={state.positionSize}
            riskMode={state.riskMode}
            showAdvanced={state.showAdvanced}
            advancedSettings={state.advancedSettings}
          />
          <PositionsList 
            positions={state.positions}
            closePosition={state.closePosition}
            closeAllPositions={state.closeAllPositions}
          />
        </div>

        {/* Desktop / Landscape Layout */}
        <div className={`hidden lg:block w-full h-screen overflow-hidden transition-colors duration-300 ${
          state.theme === 'dark'
            ? 'bg-gradient-to-br from-gray-950 via-gray-900 to-black text-white'
            : 'bg-gradient-to-br from-gray-50 via-white to-gray-100 text-gray-900'
        }`}>
          <div className="flex h-full gap-6 p-8 overflow-hidden">
            {/* Left Panel: Chart & Market Info (flex-1) */}
            <div className="flex-1 flex flex-col gap-4 min-w-0 min-h-0 overflow-hidden">
              <Header balance={state.balance} positions={state.positions} onReset={state.resetState} theme={state.theme} onThemeChange={state.setTheme} totalMarginUsed={totalMarginUsed} />
              
              {/* Market Selector */}
              <div className="bg-gray-800/50 rounded-2xl p-4 flex-shrink-0">
                <div className="grid grid-cols-3 gap-2">
                  {['BTC', 'ETH', 'SOL'].map(market => (
                    <button
                      key={market}
                      onClick={() => state.setSelectedMarket(market)}
                      className={`py-3 px-3 rounded-xl font-semibold transition-all text-sm ${
                        state.selectedMarket === market
                          ? 'bg-blue-500 text-white shadow-lg shadow-blue-500/50'
                          : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
                      }`}
                    >
                      <div className="text-xs opacity-80">{market}</div>
                      <div className="text-sm font-bold">
                        {state.prices[market] ? `$${Number(state.prices[market]).toFixed(0)}` : '...'}
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Large Chart Area - takes remaining space */}
              <div className="flex-1 bg-gray-800/30 rounded-2xl p-6 flex flex-col items-center justify-center overflow-hidden min-h-0">
                <div className="flex-shrink-0">
                  <MarketPrice
                    market={state.selectedMarket}
                    price={state.prices[state.selectedMarket]}
                    isLive={!!(state.livePrices.BTC && state.livePrices.ETH && state.livePrices.SOL)}
                  />
                </div>
                <div className="flex-1 w-full min-h-0">
                  <AlivePriceChart
                    prices={state.priceHistory[state.selectedMarket]}
                    direction={state.direction === 'LONG' ? 'UP' : 'DOWN'}
                    entryPrice={state.positions.length > 0 ? state.positions[0].entryPrice : null}
                    currentPrice={state.prices[state.selectedMarket]}
                    pnl={state.positions.length > 0 ? state.positions[0].unrealizedPnL : 0}
                    highLow={state.liveHighLow[state.selectedMarket]}
                  />
                </div>
              </div>
            </div>

            {/* Right Panel: Trading Controls (w-96) */}
            <div className="w-96 flex flex-col gap-4 overflow-y-auto pr-2 flex-shrink-0 min-h-0">
              {/* Direction */}
              <div className="bg-gray-800/50 rounded-2xl p-4 flex-shrink-0">
                <div className="text-xs text-gray-400 mb-3 uppercase font-semibold">Position Direction</div>
                <DirectionSelector
                  direction={state.direction}
                  setDirection={state.setDirection}
                />
              </div>

              {/* Risk Amount */}
              <div className="bg-gray-800/50 rounded-2xl p-4 flex-shrink-0">
                <div className="text-xs text-gray-400 mb-3 uppercase font-semibold">Risk Amount</div>
                <PositionSizeSelector 
                  positionSize={state.positionSize} 
                  setPositionSize={state.setPositionSize}
                />
              </div>

              {/* Risk Mode */}
              <div className="bg-gray-800/50 rounded-2xl p-4 flex-shrink-0">
                <div className="text-xs text-gray-400 mb-3 uppercase font-semibold">Risk Mode</div>
                <RiskModeSelector 
                  riskMode={state.riskMode} 
                  setRiskMode={state.setRiskMode}
                  showAdvanced={state.showAdvanced}
                />
              </div>

              {/* Advanced Toggle */}
              <div className="flex-shrink-0">
                <AdvancedToggle 
                  showAdvanced={state.showAdvanced}
                  setShowAdvanced={state.setShowAdvanced}
                />
              </div>

              {/* Advanced Settings */}
              {state.showAdvanced && (
                <div className="bg-gray-800/50 rounded-2xl p-4 flex-shrink-0">
                  <AdvancedSettings
                    advancedSettings={state.advancedSettings}
                    setAdvancedSettings={state.setAdvancedSettings}
                    selectedMarket={state.selectedMarket}
                    prices={state.prices}
                    direction={state.direction}
                    positionSize={state.positionSize}
                    riskMode={state.riskMode}
                  />
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex-shrink-0">
                <ActionButtons 
                  openPosition={state.openPosition}
                  selectedMarket={state.selectedMarket}
                  prices={state.prices}
                  direction={state.direction}
                  positionSize={state.positionSize}
                  riskMode={state.riskMode}
                  showAdvanced={state.showAdvanced}
                  advancedSettings={state.advancedSettings}
                />
              </div>

              {/* Positions Summary */}
              <div className="bg-gray-800/50 rounded-2xl p-3 text-xs flex-shrink-0">
                <div className="text-gray-400 mb-2">Active Positions: {state.positions.length}</div>
                {state.positions.length > 0 && (
                  <div className="space-y-1">
                    {state.positions.slice(0, 3).map(pos => (
                      <div key={pos.id} className="flex justify-between text-xs text-gray-300">
                        <span>{pos.direction} {pos.market}</span>
                        <span className={pos.unrealizedPnL >= 0 ? 'text-green-400' : 'text-red-400'}>
                          {pos.unrealizedPnL >= 0 ? '+' : ''}${pos.unrealizedPnL.toFixed(2)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Positions List */}
              <div className="bg-gray-800/50 rounded-2xl p-4 flex-shrink-0 max-h-64 overflow-y-auto">
                <h3 className="text-sm font-semibold mb-4 text-gray-300">Open Positions</h3>
                <PositionsList 
                  positions={state.positions}
                  closePosition={state.closePosition}
                  closeAllPositions={state.closeAllPositions}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </AppContext.Provider>
  );
};

export default App;