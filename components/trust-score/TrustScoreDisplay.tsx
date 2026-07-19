'use client';

/**
 * Trust Score Display Component
 * Visual display of company trust score with animated circular progress
 *
 * Features:
 * - Animated circular progress indicator
 * - Color-coded by risk level
 * - Arabic category labels
 * - Score breakdown summary
 * - Confidence level indicator
 */

import React from 'react';
import { Shield, TrendingUp, TrendingDown, AlertCircle } from 'lucide-react';

interface TrustScoreDisplayProps {
  score: number; // 0-100
  category: string; // عالية جداً, عالية, متوسطة, منخفضة, منخفضة جداً
  reportCount: number;
  trendPercentage?: number;
  confidence?: number; // 0-100
  size?: 'small' | 'medium' | 'large';
  showDetails?: boolean;
}

export default function TrustScoreDisplay({
  score,
  category,
  reportCount,
  trendPercentage = 0,
  confidence = 75,
  size = 'medium',
  showDetails = true,
}: TrustScoreDisplayProps) {
  // Get color based on score
  const getScoreColor = (s: number): string => {
    if (s >= 85) return '#16a34a'; // Green - Very High
    if (s >= 70) return '#22c55e'; // Light Green - High
    if (s >= 50) return '#eab308'; // Yellow - Medium
    if (s >= 30) return '#f97316'; // Orange - Low
    return '#dc2626'; // Red - Very Low
  };

  // Get size classes
  const getSizeClasses = (s: 'small' | 'medium' | 'large') => {
    switch (s) {
      case 'small':
        return { container: 'w-24 h-24', text: 'text-lg', subtext: 'text-xs' };
      case 'large':
        return { container: 'w-40 h-40', text: 'text-5xl', subtext: 'text-sm' };
      default:
        return { container: 'w-32 h-32', text: 'text-4xl', subtext: 'text-sm' };
    }
  };

  const sizeClasses = getSizeClasses(size);
  const scoreColor = getScoreColor(score);
  const circumference = 2 * Math.PI * 45;
  const offset = circumference - (score / 100) * circumference;

  return (
    <div className="flex flex-col items-center gap-4">
      {/* Circular Progress Indicator */}
      <div className={`relative ${sizeClasses.container}`}>
        <svg className="absolute inset-0 w-full h-full -rotate-90" viewBox="0 0 100 100">
          {/* Background circle */}
          <circle
            cx="50"
            cy="50"
            r="45"
            stroke="#e5e7eb"
            strokeWidth="3"
            fill="none"
          />

          {/* Progress circle */}
          <circle
            cx="50"
            cy="50"
            r="45"
            stroke={scoreColor}
            strokeWidth="3"
            fill="none"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            strokeLinecap="round"
            style={{ transition: 'stroke-dashoffset 0.5s ease' }}
          />
        </svg>

        {/* Score text in center */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <div className={`font-bold ${sizeClasses.text}`} style={{ color: scoreColor }}>
            {score.toFixed(1)}
          </div>
          <div className={`${sizeClasses.subtext} text-gray-600`}>/100</div>
        </div>
      </div>

      {/* Category and Label */}
      <div className="text-center">
        <div className="text-lg font-semibold text-gray-900">{category}</div>
        <div className="text-sm text-gray-600">Trust Score</div>
      </div>

      {/* Trend Indicator */}
      {trendPercentage !== 0 && (
        <div
          className="flex items-center gap-1 px-3 py-1 rounded-full text-sm"
          style={{
            backgroundColor:
              trendPercentage > 0 ? 'rgb(220, 252, 231)' : 'rgb(254, 242, 242)',
          }}
        >
          {trendPercentage > 0 ? (
            <TrendingUp size={16} className="text-green-600" />
          ) : (
            <TrendingDown size={16} className="text-red-600" />
          )}
          <span style={{ color: trendPercentage > 0 ? '#15803d' : '#991b1b' }}>
            {trendPercentage > 0 ? '+' : ''}
            {trendPercentage.toFixed(1)}%
          </span>
        </div>
      )}

      {/* Details Section */}
      {showDetails && (
        <div className="w-full mt-4 space-y-3 text-sm">
          {/* Reports Count */}
          <div className="flex items-center justify-between px-3 py-2 bg-gray-50 rounded-lg">
            <div className="flex items-center gap-2 text-gray-700">
              <Shield size={16} />
              <span>Verified Reports</span>
            </div>
            <span className="font-semibold text-gray-900">{reportCount}</span>
          </div>

          {/* Confidence Level */}
          <div className="flex items-center justify-between px-3 py-2 bg-gray-50 rounded-lg">
            <div className="flex items-center gap-2 text-gray-700">
              <AlertCircle size={16} />
              <span>Confidence</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-24 h-2 bg-gray-200 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-300"
                  style={{
                    width: `${confidence}%`,
                    backgroundColor:
                      confidence >= 75 ? '#16a34a' : confidence >= 50 ? '#eab308' : '#f97316',
                  }}
                />
              </div>
              <span className="font-semibold text-gray-900 w-12 text-right">{confidence}%</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
