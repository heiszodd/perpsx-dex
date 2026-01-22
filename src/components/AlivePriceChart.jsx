import React, { useMemo } from 'react';

const AlivePriceChart = ({ prices, direction, entryPrice, currentPrice, pnl }) => {
  // Normalize prices to fit within SVG bounds
  const normalizedData = useMemo(() => {
    if (!prices || prices.length === 0) return [];

    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);
    const priceRange = maxPrice - minPrice || 1; // Avoid division by zero

    const svgWidth = 600;
    const svgHeight = 200;
    const padding = 20;

    return prices.map((price, index) => {
      const x = (index / (prices.length - 1)) * (svgWidth - 2 * padding) + padding;
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

  // Determine gradient colors based on direction
  const gradientColors = direction === 'UP'
    ? { start: '#3b82f6', end: '#8b5cf6' } // blue to purple
    : { start: '#ef4444', end: '#f97316' }; // red to orange

  // Calculate entry point and current price positions
  const entryPoint = useMemo(() => {
    if (!prices || prices.length === 0 || !entryPrice) return null;

    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);
    const priceRange = maxPrice - minPrice || 1;

    const svgWidth = 600;
    const svgHeight = 200;
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
    const svgHeight = 200;
    const padding = 20;

    // Current price is at the end of the chart
    const x = svgWidth - padding;
    const y = svgHeight - padding - ((currentPrice - minPrice) / priceRange) * (svgHeight - 2 * padding);

    return { x, y };
  }, [prices, currentPrice]);

  return (
    <div className="flex items-center justify-center w-full h-64 bg-gray-950 rounded-2xl overflow-hidden">
      <svg
        width="100%"
        height="100%"
        viewBox="0 0 600 200"
        className="drop-shadow-lg"
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

        {/* Background subtle pattern */}
        <rect width="600" height="200" fill="url(#backgroundPattern)" opacity="0.05" />

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

        {/* Animated pulse effect */}
        <circle
          cx={normalizedData[normalizedData.length - 1]?.x || 300}
          cy={normalizedData[normalizedData.length - 1]?.y || 100}
          r="4"
          fill={gradientColors.end}
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

        {/* Entry Point Marker */}
        {entryPoint && (
          <g>
            <circle
              cx={entryPoint.x}
              cy={entryPoint.y}
              r="6"
              fill="#10b981"
              stroke="white"
              strokeWidth="2"
              filter="url(#glow)"
            />
            <text
              x={entryPoint.x}
              y={entryPoint.y - 15}
              textAnchor="middle"
              fill="#10b981"
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
            stroke="white"
            strokeWidth="2"
            filter="url(#glow)"
          />
        )}
      </svg>
    </div>
  );
};

export default AlivePriceChart;
