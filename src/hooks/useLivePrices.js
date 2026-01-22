import { useState, useEffect, useCallback } from 'react';

/**
 * Custom hook for fetching real-time crypto prices
 * Uses Kraken free API (most reliable free tier with 1-second updates)
 * @param {Array} symbols - Array of crypto symbols (e.g., ['bitcoin', 'ethereum', 'solana'])
 * @param {number} pollInterval - Polling interval in milliseconds (default: 1000ms)
 * @param {number} maxHistoryPoints - Maximum number of historical price points to keep (default: 14400 for 4 hours)
 * @returns {Object} - { prices, priceHistory, isLoading, error, lastFetchTime, highLow }
 */
export const useLivePrices = (
  symbols = ['bitcoin', 'ethereum', 'solana'],
  pollInterval = 1000,
  maxHistoryPoints = 14400  // 4 hours at 1-second intervals
) => {
  const [prices, setPrices] = useState({
    BTC: null,
    ETH: null,
    SOL: null
  });

  const [priceHistory, setPriceHistory] = useState({
    BTC: [],
    ETH: [],
    SOL: []
  });

  const [highLow, setHighLow] = useState({
    BTC: { high: null, low: null },
    ETH: { high: null, low: null },
    SOL: { high: null, low: null }
  });

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastFetchTime, setLastFetchTime] = useState(null);

  // Map Kraken pair names to our internal symbols
  const symbolMap = {
    'XXBTZUSD': 'BTC',
    'XETHZUSD': 'ETH',
    'XSOLZUSD': 'SOL'
  };

  /**
   * Fetch prices from Kraken free API
   * Uses Ticker endpoint which gives best bid/ask (most reliable free tier)
   */
  const fetchPrices = useCallback(async () => {
    try {
      // Kraken free API endpoint - most reliable for frequent updates
      // Using multiple requests for each pair to be safe
      const pairs = ['XXBTZUSD', 'XETHZUSD', 'XSOLZUSD'];
      const url = `https://api.kraken.com/0/public/Ticker?pair=${pairs.join(',')}`;

      const response = await fetch(url, {
        method: 'GET',
        headers: { 'Accept': 'application/json' }
      });

      if (!response.ok) {
        throw new Error(`Kraken API error: ${response.status}`);
      }

      const data = await response.json();

      if (data.error && data.error.length > 0) {
        throw new Error(data.error[0]);
      }

      // Transform API response to our format
      const newPrices = {};
      const currentTime = Date.now();

      Object.entries(data.result || {}).forEach(([pair, tickerData]) => {
        const symbol = symbolMap[pair];
        if (symbol && tickerData && tickerData.a) {
          // Use ask price (most accurate for bid/ask)
          const price = parseFloat(tickerData.a[0]);
          newPrices[symbol] = price;
        }
      });

      // Only update if we got prices
      if (Object.keys(newPrices).length > 0) {
        // Update current prices
        setPrices(prevPrices => ({
          ...prevPrices,
          ...newPrices
        }));

        // Update price history and high/low
        setPriceHistory(prevHistory => {
          const newHistory = { ...prevHistory };

          Object.entries(newPrices).forEach(([symbol, price]) => {
            if (price !== null) {
              newHistory[symbol] = [...(prevHistory[symbol] || []), price].slice(-maxHistoryPoints);
            }
          });

          return newHistory;
        });

        // Calculate 4-hour high/low
        setHighLow(prevHighLow => {
          const newHighLow = { ...prevHighLow };

          Object.entries(newPrices).forEach(([symbol, price]) => {
            const history = priceHistory[symbol] || [];
            const allPrices = [...history, price];
            
            if (allPrices.length > 0) {
              newHighLow[symbol] = {
                high: Math.max(...allPrices),
                low: Math.min(...allPrices)
              };
            }
          });

          return newHighLow;
        });

        console.log('✅ Kraken prices updated:', newPrices);
      }

      // Clear any previous errors and update status
      setError(null);
      setLastFetchTime(currentTime);
      setIsLoading(false);

    } catch (err) {
      // Handle API failures gracefully
      console.error('🚨 Kraken API fetch failed:', err.message);

      // Set error state but don't clear existing prices
      setError(err.message);

      // If this is the first fetch, set loading to false
      if (isLoading) {
        setIsLoading(false);
      }

      // Don't update lastFetchTime on error to indicate stale data
    }
  }, [symbolMap, maxHistoryPoints, isLoading, priceHistory]);

  // Initial fetch on mount
  useEffect(() => {
    fetchPrices();
  }, []); // Only run once on mount

  // Set up polling interval
  useEffect(() => {
    const interval = setInterval(fetchPrices, pollInterval);

    return () => clearInterval(interval);
  }, [fetchPrices, pollInterval]);

  return {
    prices,
    priceHistory,
    highLow,
    isLoading,
    error,
    lastFetchTime,
    // Utility function to manually refresh prices
    refreshPrices: fetchPrices
  };
};

export default useLivePrices;
