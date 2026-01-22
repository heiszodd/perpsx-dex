import { useState, useEffect, useCallback } from 'react';

/**
 * Custom hook for fetching real-time crypto prices from CoinGecko API
 * @param {Array} symbols - Array of crypto symbols (e.g., ['bitcoin', 'ethereum', 'solana'])
 * @param {number} pollInterval - Polling interval in milliseconds (default: 2000ms for better sync)
 * @param {number} maxHistoryPoints - Maximum number of historical price points to keep (default: 50)
 * @returns {Object} - { prices, priceHistory, isLoading, error, lastFetchTime }
 */
export const useLivePrices = (
  symbols = ['bitcoin', 'ethereum', 'solana'],
  pollInterval = 2000,
  maxHistoryPoints = 50
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

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastFetchTime, setLastFetchTime] = useState(null);

  // Map CoinGecko IDs to our internal symbols
  const symbolMap = {
    bitcoin: 'BTC',
    ethereum: 'ETH',
    solana: 'SOL'
  };

  /**
   * Fetch prices from CoinGecko API
   * Uses the free API endpoint with no API key required
   */
  const fetchPrices = useCallback(async () => {
    try {
      // CoinGecko free API endpoint for multiple coins
      const ids = symbols.join(',');
      const url = `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd`;

      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(`CoinGecko API error: ${response.status}`);
      }

      const data = await response.json();

      // Transform API response to our format
      const newPrices = {};
      const currentTime = Date.now();

      symbols.forEach(symbol => {
        const internalSymbol = symbolMap[symbol];
        if (data[symbol] && data[symbol].usd) {
          newPrices[internalSymbol] = data[symbol].usd;
        }
      });

      // Update current prices
      setPrices(prevPrices => ({
        ...prevPrices,
        ...newPrices
      }));

      // Update price history
      setPriceHistory(prevHistory => {
        const newHistory = { ...prevHistory };

        Object.entries(newPrices).forEach(([symbol, price]) => {
          if (price !== null) {
            newHistory[symbol] = [...(prevHistory[symbol] || []), price].slice(-maxHistoryPoints);
          }
        });

        return newHistory;
      });

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
  }, [symbols, symbolMap, maxHistoryPoints, isLoading]);

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
    isLoading,
    error,
    lastFetchTime,
    // Utility function to manually refresh prices
    refreshPrices: fetchPrices
  };
};

export default useLivePrices;
