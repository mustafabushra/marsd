'use client';

/**
 * Trust Score Trend Chart Component
 * Displays historical trust score trends over time
 *
 * Features:
 * - Line chart visualization
 * - Multiple period views (week, month, quarter, year)
 * - Trend indicators (improving/declining/stable)
 * - Statistical data (average, min, max, volatility)
 */

import React, { useState } from 'react';
import { TrendingUp, TrendingDown, Info } from 'lucide-react';

interface TrendDataPoint {
  date: string;
  score: number;
  changePercent: number;
}

interface TrendAnalysisData {
  period: 'week' | 'month' | 'quarter' | 'year';
  dataPoints: TrendDataPoint[];
  startScore: number;
  endScore: number;
  averageScore: number;
  minScore: number;
  maxScore: number;
  totalChange: number;
  percentChange: number;
  trend: 'improving' | 'declining' | 'stable';
  volatility: number;
  recommendation: string;
  chart: {
    labels: string[];
    data: number[];
  };
}

interface TrustScoreTrendChartProps {
  trend: TrendAnalysisData;
  onPeriodChange?: (period: 'week' | 'month' | 'quarter' | 'year') => void;
}

export default function TrustScoreTrendChart({
  trend,
  onPeriodChange,
}: TrustScoreTrendChartProps) {
  const [selectedPeriod, setSelectedPeriod] = useState<'week' | 'month' | 'quarter' | 'year'>(
    trend.period,
  );

  const handlePeriodChange = (period: 'week' | 'month' | 'quarter' | 'year') => {
    setSelectedPeriod(period);
    onPeriodChange?.(period);
  };

  const getTrendColor = (t: string) => {
    switch (t) {
      case 'improving':
        return '#16a34a';
      case 'declining':
        return '#dc2626';
      default:
        return '#6b7280';
    }
  };

  const getTrendIcon = (t: string) => {
    if (t === 'improving') return <TrendingUp size={20} className="text-green-600" />;
    if (t === 'declining') return <TrendingDown size={20} className="text-red-600" />;
    return <div className="w-5 h-5 rounded-full bg-gray-400" />;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-900">Trust Score Trend</h2>
      </div>

      {/* Period Selector */}
      <div className="flex gap-2">
        {(['week', 'month', 'quarter', 'year'] as const).map((period) => (
          <button
            key={period}
            onClick={() => handlePeriodChange(period)}
            className={`px-4 py-2 rounded-lg font-medium text-sm transition-colors ${
              selectedPeriod === period
                ? 'bg-green-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            {period.charAt(0).toUpperCase() + period.slice(1)}
          </button>
        ))}
      </div>

      {/* Trend Overview Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          label="Start Score"
          value={trend.startScore.toFixed(1)}
          subtext="Beginning of period"
        />
        <StatCard
          label="End Score"
          value={trend.endScore.toFixed(1)}
          subtext="Current value"
          highlight={trend.percentChange > 0}
        />
        <StatCard label="Average" value={trend.averageScore.toFixed(1)} subtext="Period average" />
        <StatCard label="Trend" value={trend.trend} subtext="Direction" />
      </div>

      {/* Chart */}
      <div className="bg-white border border-gray-200 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Score Over Time</h3>

        {trend.chart.data.length > 0 ? (
          <SimpleLineChart labels={trend.chart.labels} data={trend.chart.data} />
        ) : (
          <div className="text-center py-8">
            <p className="text-gray-500">No data available for this period</p>
          </div>
        )}
      </div>

      {/* Statistics Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-gray-50 rounded-lg p-4">
          <h3 className="text-sm font-semibold text-gray-700 mb-1">Total Change</h3>
          <div className="flex items-baseline gap-2">
            <div className="text-2xl font-bold text-gray-900">{trend.totalChange.toFixed(1)}</div>
            <div className="text-sm text-gray-600">
              ({trend.percentChange > 0 ? '+' : ''}{trend.percentChange.toFixed(1)}%)
            </div>
          </div>
        </div>

        <div className="bg-gray-50 rounded-lg p-4">
          <h3 className="text-sm font-semibold text-gray-700 mb-1">Min - Max</h3>
          <div className="text-2xl font-bold text-gray-900">
            {trend.minScore.toFixed(1)} - {trend.maxScore.toFixed(1)}
          </div>
          <div className="text-sm text-gray-600">Range during period</div>
        </div>

        <div className="bg-gray-50 rounded-lg p-4">
          <h3 className="text-sm font-semibold text-gray-700 mb-1">Volatility</h3>
          <div className="text-2xl font-bold text-gray-900">{trend.volatility.toFixed(1)}</div>
          <div className="text-sm text-gray-600">Standard deviation</div>
        </div>
      </div>

      {/* Trend Status */}
      <div className="bg-white border border-gray-200 rounded-lg p-4">
        <div className="flex items-center gap-3 mb-3">
          {getTrendIcon(trend.trend)}
          <h3 className="text-lg font-semibold text-gray-900 capitalize">{trend.trend}</h3>
        </div>
        <p className="text-gray-700 text-sm">{trend.recommendation}</p>
      </div>
    </div>
  );
}

/**
 * Simple Line Chart Component
 * Canvas-based chart for trend visualization
 */
function SimpleLineChart({ labels, data }: { labels: string[]; data: number[] }) {
  if (data.length === 0) return null;

  const width = 100;
  const height = 60;
  const padding = 4;
  const minValue = Math.min(...data);
  const maxValue = Math.max(...data);
  const range = maxValue - minValue || 1;

  // Calculate points
  const points = data.map((value, idx) => {
    const x = (idx / (data.length - 1 || 1)) * (width - 2 * padding) + padding;
    const y = height - ((value - minValue) / range) * (height - 2 * padding) - padding;
    return { x, y, value };
  });

  // Generate path
  const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');

  return (
    <div className="space-y-4">
      {/* SVG Chart */}
      <svg className="w-full h-48 border border-gray-100 rounded-lg" viewBox={`0 0 ${width} ${height}`}>
        {/* Grid lines */}
        {[0, 0.25, 0.5, 0.75, 1].map((ratio, idx) => (
          <line
            key={`grid-${idx}`}
            x1="0"
            y1={height - ratio * height}
            x2={width}
            y2={height - ratio * height}
            stroke="#e5e7eb"
            strokeWidth="0.2"
          />
        ))}

        {/* Line */}
        <path d={pathD} stroke="#16a34a" strokeWidth="0.8" fill="none" />

        {/* Points */}
        {points.map((p, idx) => (
          <circle key={`point-${idx}`} cx={p.x} cy={p.y} r="0.5" fill="#16a34a" />
        ))}
      </svg>

      {/* Legend */}
      <div className="flex items-center justify-between text-xs text-gray-600">
        <div>Min: {minValue.toFixed(1)}</div>
        <div>Max: {maxValue.toFixed(1)}</div>
      </div>
    </div>
  );
}

/**
 * Stat Card Component
 */
function StatCard({
  label,
  value,
  subtext,
  highlight = false,
}: {
  label: string;
  value: string;
  subtext: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={`bg-white border rounded-lg p-3 ${
        highlight ? 'border-green-200 bg-green-50' : 'border-gray-200'
      }`}
    >
      <div className="text-xs font-medium text-gray-600 mb-1">{label}</div>
      <div className="text-xl font-bold text-gray-900">{value}</div>
      <div className="text-xs text-gray-500 mt-1">{subtext}</div>
    </div>
  );
}
