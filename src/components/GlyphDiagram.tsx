import { useId } from 'react';
import type { NormalizedEdge } from '../types';
import { denormalizeEdge, edgeToSkipStart } from '../utils/edges';

export const GLYPH_NODE_COUNT = 13;
export const GLYPH_CENTER = 250;
export const GLYPH_RADIUS = 196;
export const GLYPH_START_ANGLE = -Math.PI / 2;
export const GLYPH_EDGE_ENDPOINT_INSET = 18;

export const GLYPH_LINE_COLORS = [
  'var(--line-level)',
  'var(--line-school)',
  'var(--line-damage)',
  'var(--line-area)',
  'var(--line-range)',
  'var(--line-duration)',
] as const;

export type GlyphNodePosition = {
  index: number;
  x: number;
  y: number;
};

type GlyphDiagramProps = {
  edges: Iterable<NormalizedEdge>;
  label?: string;
  className?: string;
  strokeWidth?: number;
  showNodes?: boolean;
};

export function getGlyphNodePositions(): GlyphNodePosition[] {
  return Array.from({ length: GLYPH_NODE_COUNT }, (_, index) => {
    const angle = GLYPH_START_ANGLE + (index / GLYPH_NODE_COUNT) * Math.PI * 2;

    return {
      index,
      x: GLYPH_CENTER + Math.cos(angle) * GLYPH_RADIUS,
      y: GLYPH_CENTER + Math.sin(angle) * GLYPH_RADIUS,
    };
  });
}

export function getVisibleEdgePath(start: GlyphNodePosition, end: GlyphNodePosition, skip: number): string {
  const deltaX = end.x - start.x;
  const deltaY = end.y - start.y;
  const length = Math.hypot(deltaX, deltaY);
  const insetRatio = length > 0 ? Math.min(GLYPH_EDGE_ENDPOINT_INSET / length, 0.28) : 0;
  const visibleStart = {
    x: start.x + deltaX * insetRatio,
    y: start.y + deltaY * insetRatio,
  };
  const visibleEnd = {
    x: end.x - deltaX * insetRatio,
    y: end.y - deltaY * insetRatio,
  };
  const midX = (visibleStart.x + visibleEnd.x) / 2;
  const midY = (visibleStart.y + visibleEnd.y) / 2;
  const centerDeltaX = GLYPH_CENTER - midX;
  const centerDeltaY = GLYPH_CENTER - midY;
  const centerDistance = Math.hypot(centerDeltaX, centerDeltaY);
  const curveStrength = skip === 0 ? 14 : Math.max(18, 42 - skip * 4);
  const curveRatio = centerDistance > 0 ? curveStrength / centerDistance : 0;
  const controlX = midX + centerDeltaX * curveRatio;
  const controlY = midY + centerDeltaY * curveRatio;

  return `M ${visibleStart.x} ${visibleStart.y} Q ${controlX} ${controlY} ${visibleEnd.x} ${visibleEnd.y}`;
}

export function GlyphDiagram({
  edges,
  label = 'Spell glyph',
  className = '',
  strokeWidth = 3,
  showNodes = false,
}: GlyphDiagramProps) {
  const filterId = `line-glow-${useId().replaceAll(':', '')}`;
  const nodePositions = getGlyphNodePositions();
  const positionByIndex = new Map(nodePositions.map((position) => [position.index, position]));

  return (
    <svg
      aria-label={label}
      className={className}
      viewBox="0 0 500 500"
      role="img"
    >
      <defs>
        <filter id={filterId}>
          <feGaussianBlur stdDeviation="3" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      <circle
        cx={GLYPH_CENTER}
        cy={GLYPH_CENTER}
        r={GLYPH_RADIUS}
        fill="none"
        stroke="var(--glyph-ring)"
        strokeDasharray="2 10"
        strokeWidth="2"
      />
      <g>
        {[...edges].map((edge) => {
          const { a, b } = denormalizeEdge(edge);
          const start = positionByIndex.get(a);
          const end = positionByIndex.get(b);
          const { skip } = edgeToSkipStart(edge);
          const strokeColor = GLYPH_LINE_COLORS[skip] ?? 'var(--line-level)';

          if (!start || !end) {
            return null;
          }

          return (
            <path
              key={edge}
              d={getVisibleEdgePath(start, end, skip)}
              fill="none"
              stroke={strokeColor}
              strokeLinecap="round"
              strokeWidth={strokeWidth}
              filter={`url(#${filterId})`}
            />
          );
        })}
      </g>
      {showNodes ? (
        <g>
          {nodePositions.map((node) => (
            <circle
              key={node.index}
              cx={node.x}
              cy={node.y}
              r="7"
              fill="var(--bg-node)"
              stroke="var(--border-strong)"
              strokeWidth="2"
            />
          ))}
        </g>
      ) : null}
    </svg>
  );
}
