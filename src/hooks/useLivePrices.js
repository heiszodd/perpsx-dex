import { useState, useEffect, useCallback } from 'react';

/**
 * Custom hook for fetching real-time crypto prices
 * Uses CoinGecko free API (no API key required)
 * @param {Array} symbols - Array of crypto symbols (e.g., ['bitcoin', 'ethereum', 'solana'])
 * @param {number} pollInterval - Polling interval in milliseconds (default: 1000ms)
 * @param {number} maxHistoryPoints - Maximum number of historical price points to keep (default: 3600 for 1 hour)
 * @returns {Object} - { prices, priceHistory, isLoading, error, lastFetchTime, highLow }
 */
export const useLivePrices = (
  symbols = ['bitcoin', 'ethereum', 'solana'],
  pollInterval = 1000,
  maxHistoryPoints = 3600  // 1 hour at 1-second intervals
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

  // Map CoinGecko IDs to our internal symbols
  const symbolMap = {
    'bitcoin': 'BTC',
    'ethereum': 'ETH',
    'solana': 'SOL'
  };

  /**
   * Fetch prices from CoinGecko free API
   * No authentication required, generous rate limits
   */
  const fetchPrices = useCallback(async () => {
    try {
      // CoinGecko free API endpoint
      const ids = ['bitcoin', 'ethereum', 'solana'];
      const url = `https://api.coingecko.com/api/v3/simple/price?ids=${ids.join(',')}&vs_currencies=usd`;

      const response = await fetch(url, {
        method: 'GET',
        headers: { 'Accept': 'application/json' }
      });

      if (!response.ok) {
        throw new Error(`CoinGecko API error: ${response.status}`);
      }

      const data = await response.json();

      // Transform API response to our format
      const newPrices = {};
      const currentTime = Date.now();

      Object.entries(data).forEach(([id, priceData]) => {
        const symbol = symbolMap[id];
        if (symbol && priceData.usd) {
          const price = parseFloat(priceData.usd);
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

        // Calculate high/low
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

        console.log('✅ CoinGecko prices updated:', newPrices);
      }

      // Clear any previous errors and update status
      setError(null);
      setLastFetchTime(currentTime);
      setIsLoading(false);

    } catch (err) {
      // Handle API failures gracefully
      console.error('🚨 CoinGecko API fetch failed:', err.message);

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
