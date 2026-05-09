import { RotateCcw } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { NormalizedEdge } from '../types';
import { denormalizeEdge, normalizeEdge } from '../utils/edges';

const NODE_COUNT = 13;
const CENTER = 250;
const RADIUS = 196;
const START_ANGLE = -Math.PI / 2;

type GlyphBoardProps = {
  drawnEdges: Set<NormalizedEdge>;
  canToggleEdge: (edge: NormalizedEdge) => boolean;
  onToggleEdge: (edge: NormalizedEdge) => void;
  onReset: () => void;
};

type NodePosition = {
  index: number;
  x: number;
  y: number;
};

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

export function GlyphBoard({ drawnEdges, canToggleEdge, onToggleEdge, onReset }: GlyphBoardProps) {
  const [selectedNode, setSelectedNode] = useState<number | null>(null);
  const nodePositions = useMemo(getNodePositions, []);
  const positionByIndex = useMemo(
    () => new Map(nodePositions.map((position) => [position.index, position])),
    [nodePositions],
  );

  function handleNodeClick(nodeIndex: number) {
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
      <div className="relative aspect-square w-full overflow-hidden rounded-lg border border-amber-200/20 bg-[#130f0b]/90 shadow-glyph">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(155,108,39,0.2),rgba(19,15,11,0)_58%)]" />
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
            stroke="rgba(245, 214, 142, 0.18)"
            strokeDasharray="2 10"
            strokeWidth="2"
          />
          {[...drawnEdges].map((edge) => {
            const { a, b } = denormalizeEdge(edge);
            const start = positionByIndex.get(a);
            const end = positionByIndex.get(b);

            if (!start || !end) {
              return null;
            }

            return (
              <line
                key={edge}
                x1={start.x}
                y1={start.y}
                x2={end.x}
                y2={end.y}
                stroke="rgba(251, 191, 36, 0.82)"
                strokeLinecap="round"
                strokeWidth="3"
                filter="url(#line-glow)"
              />
            );
          })}
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
              disabled={isDisabled}
              onClick={() => handleNodeClick(node.index)}
              className={[
                'absolute flex h-10 w-10 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border text-xs font-bold transition',
                'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-amber-200',
                isSelected
                  ? 'border-amber-100 bg-amber-200 text-stone-950 shadow-[0_0_26px_rgba(251,191,36,0.65)]'
                  : isDisabled
                    ? 'cursor-not-allowed border-stone-600/40 bg-stone-950/80 text-stone-600 shadow-none'
                  : 'border-amber-200/50 bg-[#24180f] text-amber-100 shadow-[0_0_16px_rgba(120,53,15,0.35)] hover:border-amber-100 hover:bg-[#3a2412]',
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

      <div className="mt-4 flex items-center justify-center">
        <button
          type="button"
          onClick={() => {
            setSelectedNode(null);
            onReset();
          }}
          className="inline-flex items-center gap-2 rounded-md border border-red-300/30 bg-red-950/40 px-4 py-2 text-sm font-semibold text-red-100 transition hover:border-red-200/70 hover:bg-red-900/50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-red-200"
        >
          <RotateCcw aria-hidden="true" size={16} />
          Reset
        </button>
      </div>
    </section>
  );
}
