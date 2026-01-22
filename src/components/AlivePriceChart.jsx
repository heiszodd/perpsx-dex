import React, { useMemo } from 'react';

const AlivePriceChart = ({ prices, direction, entryPrice, currentPrice, pnl, highLow, theme = 'dark' }) => {
  // Normalize prices to fit within SVG bounds
  const normalizedData = useMemo(() => {
    if (!prices || prices.length === 0) return [];

    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);
    const priceRange = maxPrice - minPrice || 1; // Avoid division by zero

    const svgWidth = 600;
    const svgHeight = 250;
    const padding = 20;

    return prices.map((price, index) => {
      const x = (index / Math.max(prices.length - 1, 1)) * (svgWidth - 2 * padding) + padding;
      const y = svgHeight - padding - ((price - minPrice) / priceRange) * (svgHeight - 2 * padding);
      return { x, y };
    });
  }, [prices]);

  // Generate smooth SVG path using cubic bezier curves
  const pathData = useMemo(() => {
    if (normalizedData.length < 2) return '';

    let path = `M ${normalizedData[0].x} ${normalizedData[0].y}`;

    for (let i = 0; i < normalizedData.length - 1; i++) {
      const current = normalizedData[i];
      const next = normalizedData[i + 1];

      // Control points for smooth curve
      const cp1x = current.x + (next.x - current.x) / 3;
      const cp1y = current.y;
      const cp2x = next.x - (next.x - current.x) / 3;
      const cp2y = next.y;

      path += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${next.x} ${next.y}`;
    }

    return path;
  }, [normalizedData]);

  // Determine gradient colors based on direction and theme
  const gradientColors = direction === 'UP'
    ? { 
        start: theme === 'dark' ? '#3b82f6' : '#1e40af', 
        end: theme === 'dark' ? '#8b5cf6' : '#6d28d9' 
      }
    : { 
        start: theme === 'dark' ? '#ef4444' : '#991b1b', 
        end: theme === 'dark' ? '#f97316' : '#c2410c' 
      };

  // Chart background color based on theme
  const chartBg = theme === 'dark' ? 'rgba(31, 41, 55, 0.5)' : 'rgba(243, 244, 246, 0.7)';

  // Calculate entry point and current price positions
  const entryPoint = useMemo(() => {
    if (!prices || prices.length === 0 || !entryPrice) return null;

    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);
    const priceRange = maxPrice - minPrice || 1;

    const svgWidth = 600;
    const svgHeight = 250;
    const padding = 20;

    // Entry point is at the middle of the chart (where position was opened)
    const x = svgWidth / 2;
    const y = svgHeight - padding - ((entryPrice - minPrice) / priceRange) * (svgHeight - 2 * padding);

    return { x, y };
  }, [prices, entryPrice]);

  const currentPoint = useMemo(() => {
    if (!prices || prices.length === 0 || !currentPrice) return null;

    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);
    const priceRange = maxPrice - minPrice || 1;

    const svgWidth = 600;
    const svgHeight = 250;
    const padding = 20;

    // Current price is at the end of the chart
    const x = svgWidth - padding;
    const y = svgHeight - padding - ((currentPrice - minPrice) / priceRange) * (svgHeight - 2 * padding);

    return { x, y };
  }, [prices, currentPrice]);

  return (
    <div className={`w-full h-full min-h-96 flex items-center justify-center rounded-lg overflow-hidden ${
      theme === 'dark' ? 'bg-gray-950/50' : 'bg-gray-200/30'
    }`}>
      <svg
        width="100%"
        height="100%"
        viewBox="0 0 600 250"
        preserveAspectRatio="xMidYMid meet"
        className="drop-shadow-lg"
        style={{ minHeight: '300px' }}
      >
        <defs>
          {/* Gradient definition */}
          <linearGradient id="priceGradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor={gradientColors.start} stopOpacity="0.8" />
            <stop offset="100%" stopColor={gradientColors.end} stopOpacity="0.8" />
          </linearGradient>

          {/* Glow filter */}
          <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="3" result="coloredBlur"/>
            <feMerge>
              <feMergeNode in="coloredBlur"/>
              <feMergeNode in="SourceGraphic"/>
            </feMerge>
          </filter>
        </defs>

        {/* Background */}
        <rect width="600" height="250" fill={chartBg} />

        {/* Main price line */}
        <path
          d={pathData}
          fill="none"
          stroke="url(#priceGradient)"
          strokeWidth="3"
          filter="url(#glow)"
          className="transition-all duration-1000 ease-out"
          style={{
            strokeLinecap: 'round',
            strokeLinejoin: 'round',
          }}
        />

        {/* Animated pulse effect - ONLY if there's a position with pnl */}
        {pnl !== undefined && pnl !== 0 && (
          <circle
            cx={normalizedData[normalizedData.length - 1]?.x || 300}
            cy={normalizedData[normalizedData.length - 1]?.y || 100}
            r="4"
            fill={pnl >= 0 ? '#10b981' : '#ef4444'}
            opacity="0.6"
            className="animate-pulse"
          >
            <animate
              attributeName="r"
              values="4;6;4"
              dur="2s"
              repeatCount="indefinite"
            />
          </circle>
        )}

        {/* Entry Point Marker */}
        {entryPoint && (
          <g>
            <circle
              cx={entryPoint.x}
              cy={entryPoint.y}
              r="6"
              fill="#10b981"
              stroke={theme === 'dark' ? 'white' : '#1f2937'}
              strokeWidth="2"
              filter="url(#glow)"
            />
            <text
              x={entryPoint.x}
              y={entryPoint.y - 15}
              textAnchor="middle"
              fill={theme === 'dark' ? '#10b981' : '#059669'}
              fontSize="10"
              fontWeight="bold"
              filter="url(#glow)"
            >
              ENTRY
            </text>
          </g>
        )}

        {/* Current Price Marker */}
        {currentPoint && (
          <circle
            cx={currentPoint.x}
            cy={currentPoint.y}
            r="6"
            fill={pnl >= 0 ? "#10b981" : "#ef4444"}
            stroke={theme === 'dark' ? 'white' : '#1f2937'}
            strokeWidth="2"
            filter="url(#glow)"
          />
        )}

        {/* 4-Hour High/Low Display */}
        {highLow && highLow.high && highLow.low && (
          <g>
            {/* High line indicator */}
            <line x1="50" y1="30" x2="550" y2="30" stroke={theme === 'dark' ? '#10b981' : '#059669'} strokeWidth="1" opacity="0.7" strokeDasharray="4" />
            <text x="555" y="35" fontSize="11" fill={theme === 'dark' ? '#10b981' : '#059669'} opacity="1" fontWeight="bold">
              H: ${highLow.high.toFixed(0)}
            </text>

            {/* Low line indicator */}
            <line x1="50" y1="220" x2="550" y2="220" stroke={theme === 'dark' ? '#ef4444' : '#991b1b'} strokeWidth="1" opacity="0.7" strokeDasharray="4" />
            <text x="555" y="225" fontSize="11" fill={theme === 'dark' ? '#ef4444' : '#991b1b'} opacity="1" fontWeight="bold">
              L: ${highLow.low.toFixed(0)}
            </text>
          </g>
        )}
      </svg>
    </div>
  );
};

export default React.memo(AlivePriceChart);
