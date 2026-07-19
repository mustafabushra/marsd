'use client';

/**
 * Trust Score Breakdown Component
 * Shows detailed breakdown of trust score components
 *
 * Features:
 * - Component score breakdown (Official, Community, Platform)
 * - Visual progress bars with percentages
 * - Weighted contribution display
 * - Component descriptions
 */

import React from 'react';
import { Building2, Users, Zap } from 'lucide-react';

interface Component {
  label: string;
  description: string;
  score: number;
  weight: number;
  percentage: number;
  icon: React.ReactNode;
  color: string;
}

interface TrustScoreBreakdownProps {
  components: {
    official: Component;
    community: Component;
    platform: Component;
  };
  finalScore: number;
  lastCalculated: string;
}

export default function TrustScoreBreakdown({
  components,
  finalScore,
  lastCalculated,
}: TrustScoreBreakdownProps) {
  const componentsList = [
    {
      key: 'official',
      ...components.official,
    },
    {
      key: 'community',
      ...components.community,
    },
    {
      key: 'platform',
      ...components.platform,
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Score Breakdown</h2>
          <p className="text-sm text-gray-600 mt-1">
            Last calculated: {new Date(lastCalculated).toLocaleDateString('ar-SA')}
          </p>
        </div>
        <div className="text-right">
          <div className="text-4xl font-bold text-gray-900">{finalScore.toFixed(1)}</div>
          <div className="text-sm text-gray-600">/100</div>
        </div>
      </div>

      {/* Components Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {componentsList.map((component) => (
          <ComponentCard key={component.key} component={component} />
        ))}
      </div>

      {/* Contribution Chart */}
      <div className="bg-gray-50 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Weighted Contribution</h3>
        <div className="space-y-4">
          {componentsList.map((component) => (
            <div key={component.key}>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  {component.icon}
                  <span className="text-sm font-medium text-gray-700">{component.label}</span>
                </div>
                <span className="text-sm font-semibold text-gray-900">
                  {(component.weight * 100).toFixed(0)}%
                </span>
              </div>
              <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-300"
                  style={{
                    width: `${component.weight * 100}%`,
                    backgroundColor: component.color,
                  }}
                />
              </div>
              <p className="text-xs text-gray-600 mt-1">{component.description}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Score Explanation */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h3 className="text-sm font-semibold text-blue-900 mb-2">How is this score calculated?</h3>
        <p className="text-sm text-blue-800">
          The trust score is a weighted combination of official government registry status
          (30%) and community-verified reports (70%). Each component is independently calculated
          and combined to provide a comprehensive trust assessment. Reports are time-weighted,
          giving more recent feedback greater influence.
        </p>
      </div>
    </div>
  );
}

/**
 * Component Card - Individual component display
 */
function ComponentCard({
  component,
}: {
  component: {
    key: string;
    label: string;
    description: string;
    score: number;
    weight: number;
    percentage: number;
    icon: React.ReactNode;
    color: string;
  };
}) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow">
      <div className="flex items-center gap-3 mb-3">
        <div style={{ color: component.color }}>{component.icon}</div>
        <div>
          <h3 className="font-semibold text-gray-900 text-sm">{component.label}</h3>
          <p className="text-xs text-gray-600">{component.description}</p>
        </div>
      </div>

      {/* Score Display */}
      <div className="flex items-baseline gap-2 mb-3">
        <div className="text-2xl font-bold" style={{ color: component.color }}>
          {component.score.toFixed(1)}
        </div>
        <div className="text-xs text-gray-600">/100</div>
      </div>

      {/* Progress Bar */}
      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-300"
          style={{
            width: `${component.percentage}%`,
            backgroundColor: component.color,
          }}
        />
      </div>

      {/* Weight Info */}
      <div className="mt-3 text-xs text-gray-600">
        Weight: <span className="font-semibold">{(component.weight * 100).toFixed(0)}%</span>
      </div>
    </div>
  );
}
