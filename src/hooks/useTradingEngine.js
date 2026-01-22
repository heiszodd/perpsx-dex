import { useState, useEffect } from 'react';

export const useTradingEngine = () => {
  const [balance, setBalance] = useState(1000);
  const [prices, setPrices] = useState({
    BTC: null,
    ETH: null,
    SOL: null
  });
  const [positions, setPositions] = useState([]);
  const [selectedMarket, setSelectedMarket] = useState('BTC');
  const [direction, setDirection] = useState('LONG');
  const [positionSize, setPositionSize] = useState(50);
  const [riskMode, setRiskMode] = useState('BALANCED');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [advancedSettings, setAdvancedSettings] = useState({
    orderType: 'MARKET', // MARKET or LIMIT
    limitPrice: '',
    customLeverage: '',
    takeProfit: '',
    stopLoss: ''
  });

  // Map risk modes to leverage
  const leverageMap = {
    SAFE: 2,
    BALANCED: 5,
    DEGENERATE: 10
  };

  // Trading fees and funding configuration
  const TRADING_FEE_RATE = 0.0004; // 0.04%
  const FUNDING_INTERVAL = 30000; // 30 seconds
  const FUNDING_RATE = 0.0001; // 0.01% per funding period

  // Price engine configuration
  const priceConfig = {
    BTC: { initialPrice: 95000, volatility: 0.002, seed: 12345 }, // ±0.2%
    ETH: { initialPrice: 3500, volatility: 0.003, seed: 67890 },  // ±0.3%
    SOL: { initialPrice: 140, volatility: 0.004, seed: 11111 }    // ±0.4%
  };

  // Seeded random number generator (Linear Congruential Generator)
  const seededRandom = (seed) => {
    let x = seed;
    return () => {
      x = (x * 1664525 + 1013904223) % 4294967296;
      return x / 4294967296;
    };
  };

  // Initialize prices with seeded values
  useEffect(() => {
    setPrices({
      BTC: priceConfig.BTC.initialPrice,
      ETH: priceConfig.ETH.initialPrice,
      SOL: priceConfig.SOL.initialPrice
    });
  }, []);

  // Deterministic random walk price engine
  useEffect(() => {
    const randomGenerators = {
      BTC: seededRandom(priceConfig.BTC.seed),
      ETH: seededRandom(priceConfig.ETH.seed),
      SOL: seededRandom(priceConfig.SOL.seed)
    };

    const interval = setInterval(() => {
      setPrices(prev => ({
        BTC: prev.BTC * (1 + (randomGenerators.BTC() - 0.5) * priceConfig.BTC.volatility * 2),
        ETH: prev.ETH * (1 + (randomGenerators.ETH() - 0.5) * priceConfig.ETH.volatility * 2),
        SOL: prev.SOL * (1 + (randomGenerators.SOL() - 0.5) * priceConfig.SOL.volatility * 2)
      }));
    }, 1500); // Update every 1.5 seconds

    return () => clearInterval(interval);
  }, []);

  // Funding rate simulation - runs every 30 seconds
  useEffect(() => {
    const fundingInterval = setInterval(() => {
      if (positions.length > 0) {
        setBalance(prevBalance => {
          let totalFundingCost = 0;

          positions.forEach(pos => {
            // Funding cost = positionSize * fundingRate * (direction multiplier)
            // Longs pay shorts when fundingRate > 0
            const directionMultiplier = pos.direction === 'LONG' ? 1 : -1;
            const fundingCost = pos.size * FUNDING_RATE * directionMultiplier;
            totalFundingCost += fundingCost;
          });

          const newBalance = prevBalance - totalFundingCost;

          if (Math.abs(totalFundingCost) > 0.01) { // Only log significant funding costs
            console.log(`💰 Funding payment: ${totalFundingCost >= 0 ? '+' : ''}$${totalFundingCost.toFixed(4)} (Balance: $${newBalance.toFixed(2)})`);
          }

          return newBalance;
        });
      }
    }, FUNDING_INTERVAL);

    return () => clearInterval(fundingInterval);
  }, [positions]);

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
          const leverage = pos.leverage;
          const pnl = (priceDiff / pos.entryPrice) * pos.size * leverage * multiplier;

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

          // Check liquidation
          const lossThreshold = pos.initialMargin - pos.maintenanceMargin;
          if (pnl <= -lossThreshold) {
            const closedPos = { ...pos, unrealizedPnL: -pos.size, liquidated: true };
            closedPositions.push(closedPos);
            return closedPos;
          }

          return { ...pos, unrealizedPnL: pnl };
        });

        // Externally compute balance adjustments from closed positions
        if (closedPositions.length > 0) {
          const totalReturn = closedPositions.reduce((sum, p) => {
            if (p.liquidated) {
              // For liquidation: return margin + negative PnL (which is -positionSize)
              return sum + p.initialMargin + p.unrealizedPnL;
            }
            // For TP/SL: return margin + PnL
            return sum + p.initialMargin + p.unrealizedPnL;
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

  const openPosition = (selectedMarket, direction, positionSize, riskMode, showAdvanced, advancedSettings) => {
    const currentPrice = prices[selectedMarket];
    if (!currentPrice) return;

    // Use custom leverage if advanced mode is on, otherwise use risk mode
    const leverage = showAdvanced && advancedSettings.customLeverage
      ? parseFloat(advancedSettings.customLeverage)
      : leverageMap[riskMode];

    const initialMargin = positionSize / leverage;
    const openFee = positionSize * TRADING_FEE_RATE;
    const totalCost = initialMargin + openFee;

    // Check if balance is sufficient
    if (balance < totalCost) {
      console.log(`❌ Insufficient balance. Required: $${totalCost.toFixed(2)} (Margin: $${initialMargin.toFixed(2)}, Fee: $${openFee.toFixed(4)}), Available: $${balance.toFixed(2)}`);
      return;
    }

    // For limit orders, check if price needs to be triggered
    if (advancedSettings.orderType === 'LIMIT' && advancedSettings.limitPrice) {
      const limitPrice = parseFloat(advancedSettings.limitPrice);
      // In real app, this would be queued. For demo, we'll just use limit as entry
      const entryPrice = limitPrice;

      const maintenanceMarginLimit = initialMargin * 0.5;
      const marginUsedLimit = initialMargin;
      const liquidationDistanceLimit = 0.5 / leverage;
      const liquidationPriceLimit = direction === 'LONG'
        ? entryPrice * (1 - liquidationDistanceLimit)
        : entryPrice * (1 + liquidationDistanceLimit);

      const newPosition = {
        id: Date.now(),
        market: selectedMarket,
        entryPrice: entryPrice,
        direction,
        size: positionSize,
        riskMode: showAdvanced ? 'CUSTOM' : riskMode,
        leverage,
        initialMargin,
        maintenanceMargin: maintenanceMarginLimit,
        marginUsed: marginUsedLimit,
        liquidationPrice: liquidationPriceLimit,
        unrealizedPnL: 0,
        openedAt: new Date().toLocaleTimeString(),
        takeProfit: advancedSettings.takeProfit ? parseFloat(advancedSettings.takeProfit) : null,
        stopLoss: advancedSettings.stopLoss ? parseFloat(advancedSettings.stopLoss) : null
      };

      // Atomic state update: deduct margin + fee and add position
      setBalance(prev => prev - totalCost);
      setPositions(prev => [...prev, newPosition]);
      console.log(`✅ Opened ${direction} position: ${positionSize} at ${leverage}x leverage. Margin: $${initialMargin.toFixed(2)}, Fee: $${openFee.toFixed(4)}`);
      return;
    }

    // Market order
    const maintenanceMargin = initialMargin * 0.5;
    const marginUsed = initialMargin;
    const liquidationDistance = 0.5 / leverage;
    const liquidationPrice = direction === 'LONG'
      ? currentPrice * (1 - liquidationDistance)
      : currentPrice * (1 + liquidationDistance);

    const newPosition = {
      id: Date.now(),
      market: selectedMarket,
      entryPrice: currentPrice,
      direction,
      size: positionSize,
      riskMode: showAdvanced ? 'CUSTOM' : riskMode,
      leverage,
      initialMargin,
      maintenanceMargin,
      marginUsed,
      liquidationPrice,
      unrealizedPnL: 0,
      openedAt: new Date().toLocaleTimeString(),
      takeProfit: advancedSettings.takeProfit ? parseFloat(advancedSettings.takeProfit) : null,
      stopLoss: advancedSettings.stopLoss ? parseFloat(advancedSettings.stopLoss) : null
    };

    // Atomic state update: deduct margin + fee and add position
    setBalance(prev => prev - totalCost);
    setPositions(prev => [...prev, newPosition]);
    console.log(`✅ Opened ${direction} position: ${positionSize} at ${leverage}x leverage. Margin: $${initialMargin.toFixed(2)}, Fee: $${openFee.toFixed(4)}`);
  };

  const closePosition = (positionId) => {
    const position = positions.find(p => p.id === positionId);
    if (!position) return;

    const pnl = position.unrealizedPnL;
    const margin = position.initialMargin;
    const closeFee = position.size * TRADING_FEE_RATE;

    // Atomic state update: return margin + PnL - close fee and remove position
    setBalance(prev => prev + margin + pnl - closeFee);
    setPositions(prev => prev.filter(p => p.id !== positionId));

    console.log(`✅ Closed ${position.direction} position: ${position.size} at ${position.leverage}x leverage. Margin: $${margin.toFixed(2)}, PnL: ${pnl >= 0 ? '+' : ''}$${pnl.toFixed(2)}, Fee: $${closeFee.toFixed(4)}`);
  };

  const closeAllPositions = () => {
    const totalPnL = positions.reduce((sum, pos) => sum + pos.unrealizedPnL, 0);
    const totalMargin = positions.reduce((sum, pos) => sum + pos.initialMargin, 0);
    const totalCloseFees = positions.reduce((sum, pos) => sum + (pos.size * TRADING_FEE_RATE), 0);

    // Atomic state update: return all margin + total PnL - total close fees and clear positions
    setBalance(prev => prev + totalMargin + totalPnL - totalCloseFees);
    setPositions([]);

    console.log(`✅ Closed all positions. Total margin: $${totalMargin.toFixed(2)}, Total PnL: ${totalPnL >= 0 ? '+' : ''}$${totalPnL.toFixed(2)}, Total fees: $${totalCloseFees.toFixed(4)}`);
  };

  return {
    balance,
    prices,
    positions,
    selectedMarket,
    setSelectedMarket,
    direction,
    setDirection,
    positionSize,
    setPositionSize,
    riskMode,
    setRiskMode,
    showAdvanced,
    setShowAdvanced,
    advancedSettings,
    setAdvancedSettings,
    openPosition,
    closePosition,
    closeAllPositions
  };
};
