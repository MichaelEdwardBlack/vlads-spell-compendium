import { RotateCcw, WandSparkles } from 'lucide-react';
import type { CSSProperties } from 'react';
import { useMemo, useState } from 'react';
import type { NormalizedEdge } from '../types';
import { denormalizeEdge, edgeToSkipStart, normalizeEdge } from '../utils/edges';

const NODE_COUNT = 13;
const CENTER = 250;
const RADIUS = 196;
const START_ANGLE = -Math.PI / 2;
const EDGE_ENDPOINT_INSET = 18;
const LINE_COLORS = [
  'var(--line-level)',
  'var(--line-school)',
  'var(--line-damage)',
  'var(--line-area)',
  'var(--line-range)',
  'var(--line-duration)',
] as const;

type GlyphBoardProps = {
  drawnEdges: Set<NormalizedEdge>;
  canToggleEdge: (edge: NormalizedEdge) => boolean;
  isRevealing?: boolean;
  isRevealLocked?: boolean;
  revealRotationStepsByEdge?: Record<NormalizedEdge, number>;
  onToggleEdge: (edge: NormalizedEdge) => void;
  onNormalize?: () => void;
  onReset: () => void;
};

type NodePosition = {
  index: number;
  x: number;
  y: number;
};

function getVisibleEdgePath(start: NodePosition, end: NodePosition, skip: number): string {
  const deltaX = end.x - start.x;
  const deltaY = end.y - start.y;
  const length = Math.hypot(deltaX, deltaY);
  const insetRatio = length > 0 ? Math.min(EDGE_ENDPOINT_INSET / length, 0.28) : 0;
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
  const centerDeltaX = CENTER - midX;
  const centerDeltaY = CENTER - midY;
  const centerDistance = Math.hypot(centerDeltaX, centerDeltaY);
  const curveStrength = skip === 0 ? 14 : Math.max(18, 42 - skip * 4);
  const curveRatio = centerDistance > 0 ? curveStrength / centerDistance : 0;
  const controlX = midX + centerDeltaX * curveRatio;
  const controlY = midY + centerDeltaY * curveRatio;

  return `M ${visibleStart.x} ${visibleStart.y} Q ${controlX} ${controlY} ${visibleEnd.x} ${visibleEnd.y}`;
}

function getRevealLineStyle(
  edge: NormalizedEdge,
  index: number,
  isRevealing: boolean,
  isRevealLocked: boolean,
  revealRotationStepsByEdge: Record<NormalizedEdge, number>,
): CSSProperties | undefined {
  if (!isRevealing || isRevealLocked) {
    return undefined;
  }

  const rotationDegrees = (revealRotationStepsByEdge[edge] ?? 0) * (360 / NODE_COUNT);

  return {
    animationDelay: `${index * 20}ms`,
    '--edge-reveal-rotation': `${rotationDegrees}deg`,
  } as CSSProperties;
}

function getNodePositions(): NodePosition[] {
  return Array.from({ length: NODE_COUNT }, (_, index) => {
    const angle = START_ANGLE + (index / NODE_COUNT) * Math.PI * 2;

    return {
      index,
      x: CENTER + Math.cos(angle) * RADIUS,
      y: CENTER + Math.sin(angle) * RADIUS,
    };
  });
}

export function GlyphBoard({
  drawnEdges,
  canToggleEdge,
  isRevealing = false,
  isRevealLocked = false,
  revealRotationStepsByEdge = {},
  onToggleEdge,
  onNormalize,
  onReset,
}: GlyphBoardProps) {
  const [selectedNode, setSelectedNode] = useState<number | null>(null);
  const nodePositions = useMemo(getNodePositions, []);
  const positionByIndex = useMemo(
    () => new Map(nodePositions.map((position) => [position.index, position])),
    [nodePositions],
  );

  function handleNodeClick(nodeIndex: number) {
    if (isRevealing) {
      return;
    }

    if (selectedNode === null) {
      setSelectedNode(nodeIndex);
      return;
    }

    if (selectedNode === nodeIndex) {
      setSelectedNode(null);
      return;
    }

    const edge = normalizeEdge(selectedNode, nodeIndex);

    if (!canToggleEdge(edge)) {
      return;
    }

    onToggleEdge(edge);
    setSelectedNode(null);
  }

  return (
    <section className="w-full max-w-[42rem]">
      <div
        className={[
          'glyph-board relative aspect-square w-full overflow-hidden rounded-lg border shadow-glyph',
          isRevealing ? 'glyph-reveal-stage' : '',
          isRevealLocked ? 'glyph-reveal-locked' : '',
        ].join(' ')}
      >
        <div className="glyph-board-wash absolute inset-0" />
        {isRevealing ? <div className="glyph-reveal-aura" /> : null}
        <svg
          aria-hidden="true"
          className="absolute inset-0 h-full w-full"
          viewBox="0 0 500 500"
          role="img"
        >
          <defs>
            <filter id="line-glow">
              <feGaussianBlur stdDeviation="3" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>
          <circle
            cx={CENTER}
            cy={CENTER}
            r={RADIUS}
            fill="none"
            stroke="var(--glyph-ring)"
            strokeDasharray="2 10"
            strokeWidth="2"
          />
          <g>
            {[...drawnEdges].map((edge, index) => {
              const { a, b } = denormalizeEdge(edge);
              const start = positionByIndex.get(a);
              const end = positionByIndex.get(b);
              const { skip } = edgeToSkipStart(edge);
              const strokeColor = LINE_COLORS[skip] ?? 'var(--line-level)';

              if (!start || !end) {
                return null;
              }

              return (
                <path
                  key={edge}
                  className={isRevealing ? 'glyph-reveal-line' : ''}
                  style={getRevealLineStyle(
                    edge,
                    index,
                    isRevealing,
                    isRevealLocked,
                    revealRotationStepsByEdge,
                  )}
                  d={getVisibleEdgePath(start, end, skip)}
                  fill="none"
                  stroke={strokeColor}
                  strokeLinecap="round"
                  strokeWidth={isRevealLocked ? '4' : '3'}
                  filter="url(#line-glow)"
                />
              );
            })}
          </g>
        </svg>

        {nodePositions.map((node) => {
          const isSelected = selectedNode === node.index;
          const candidateEdge =
            selectedNode !== null && selectedNode !== node.index ? normalizeEdge(selectedNode, node.index) : null;
          const isDisabled = candidateEdge !== null && !canToggleEdge(candidateEdge);

          return (
            <button
              key={node.index}
              type="button"
              aria-label={`Node ${node.index + 1}`}
              aria-pressed={isSelected}
              disabled={isRevealing || isDisabled}
              onClick={() => handleNodeClick(node.index)}
              className={[
                'glyph-node absolute flex h-10 w-10 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border text-xs font-bold transition',
                'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4',
                isSelected
                  ? 'glyph-node-selected'
                  : isDisabled
                    ? 'glyph-node-disabled cursor-not-allowed shadow-none'
                  : 'glyph-node-idle',
              ].join(' ')}
              style={{
                left: `${(node.x / 500) * 100}%`,
                top: `${(node.y / 500) * 100}%`,
              }}
            >
              {node.index + 1}
            </button>
          );
        })}
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
        {onNormalize && !isRevealing ? (
          <button
            type="button"
            onClick={() => {
              setSelectedNode(null);
              onNormalize();
            }}
            className="arcane-button arcane-button-primary inline-flex items-center gap-2 rounded-md border px-4 py-2 text-sm font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4"
          >
            <WandSparkles aria-hidden="true" size={16} />
            Normalize
          </button>
        ) : null}
        <button
          type="button"
          onClick={() => {
            setSelectedNode(null);
            onReset();
          }}
          className="arcane-button arcane-button-danger inline-flex items-center gap-2 rounded-md border px-4 py-2 text-sm font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4"
        >
          <RotateCcw aria-hidden="true" size={16} />
          Reset
        </button>
      </div>
    </section>
  );
}
