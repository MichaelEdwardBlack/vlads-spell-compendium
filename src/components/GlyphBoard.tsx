import { RotateCcw, WandSparkles } from 'lucide-react';
import type { CSSProperties } from 'react';
import { useMemo, useState } from 'react';
import type { NormalizedEdge } from '../types';
import { denormalizeEdge, edgeToSkipStart, normalizeEdge } from '../utils/edges';
import {
  GLYPH_CENTER,
  GLYPH_LINE_COLORS,
  GLYPH_NODE_COUNT,
  GLYPH_RADIUS,
  getGlyphNodePositions,
  getVisibleEdgePath,
} from './GlyphDiagram';

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

  const rotationDegrees = (revealRotationStepsByEdge[edge] ?? 0) * (360 / GLYPH_NODE_COUNT);

  return {
    animationDelay: `${index * 20}ms`,
    '--edge-reveal-rotation': `${rotationDegrees}deg`,
  } as CSSProperties;
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
  const nodePositions = useMemo(getGlyphNodePositions, []);
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
            cx={GLYPH_CENTER}
            cy={GLYPH_CENTER}
            r={GLYPH_RADIUS}
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
              const strokeColor = GLYPH_LINE_COLORS[skip] ?? 'var(--line-level)';

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
