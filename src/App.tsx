import { useEffect, useMemo, useState } from 'react';
import { GlyphBoard } from './components/GlyphBoard';
import { SpellResult } from './components/SpellResult';
import type { NormalizedEdge } from './types';
import {
  countPossibleMatchingSpellsFromPartialDrawnEdges,
  findExactSpellMatch,
} from './utils/spellMatching';
import {
  denormalizeEdge,
  edgeToSkipStart,
  getNormalizationRotationStepsByEdge,
  normalizeDrawnEdges,
} from './utils/edges';
import { playSpellRevealSound, primeRevealAudio } from './utils/revealSound';
import { ATTRIBUTE_DEFINITIONS } from './data/spellwritingKeys';

const ATTRIBUTE_ACCENTS = [
  'var(--line-level)',
  'var(--line-school)',
  'var(--line-damage)',
  'var(--line-area)',
  'var(--line-range)',
  'var(--line-duration)',
] as const;
const SHOW_DRAWN_EDGE_DEBUG = import.meta.env.VITE_SHOW_DRAWN_EDGES === 'true';

function App() {
  const [drawnEdges, setDrawnEdges] = useState<Set<NormalizedEdge>>(() => new Set());
  const [isRevealingSpell, setIsRevealingSpell] = useState(false);
  const [revealRotationStepsByEdge, setRevealRotationStepsByEdge] = useState<Record<NormalizedEdge, number>>({});
  const [revealedSpellName, setRevealedSpellName] = useState<string | null>(null);
  const matchedSpell = useMemo(() => findExactSpellMatch(drawnEdges), [drawnEdges]);
  const visibleSpell = matchedSpell && matchedSpell.name === revealedSpellName ? matchedSpell : undefined;
  const possibleSpellCount = useMemo(
    () => countPossibleMatchingSpellsFromPartialDrawnEdges(drawnEdges),
    [drawnEdges],
  );
  const sortedDrawnEdges = useMemo(() => [...drawnEdges].sort(), [drawnEdges]);

  useEffect(() => {
    if (!matchedSpell || revealedSpellName === matchedSpell.name || isRevealingSpell) {
      return;
    }

    const spellName = matchedSpell.name;
    const normalizedEdges = normalizeDrawnEdges(drawnEdges);
    setRevealRotationStepsByEdge(getNormalizationRotationStepsByEdge(drawnEdges));
    setIsRevealingSpell(true);
    playSpellRevealSound();

    const lockTimer = window.setTimeout(() => {
      setDrawnEdges(new Set(normalizedEdges));
      setRevealedSpellName(spellName);
    }, 1500);

    const finishTimer = window.setTimeout(() => {
      setIsRevealingSpell(false);
      setRevealRotationStepsByEdge({});
    }, 2300);

    return () => {
      window.clearTimeout(lockTimer);
      window.clearTimeout(finishTimer);
    };
  }, [matchedSpell?.name]);

  function handleToggleEdge(edge: NormalizedEdge) {
    primeRevealAudio();
    setRevealRotationStepsByEdge({});
    setRevealedSpellName(null);
    setDrawnEdges((currentEdges) => {
      const nextEdges = new Set(currentEdges);

      if (nextEdges.has(edge)) {
        nextEdges.delete(edge);
      } else {
        nextEdges.add(edge);
      }

      return nextEdges;
    });
  }

  function canToggleEdge(edge: NormalizedEdge): boolean {
    if (drawnEdges.has(edge)) {
      return true;
    }

    return countPossibleMatchingSpellsFromPartialDrawnEdges([...drawnEdges, edge]) > 0;
  }

  function handleNormalize() {
    primeRevealAudio();
    setDrawnEdges((currentEdges) => new Set(normalizeDrawnEdges(currentEdges)));
  }

  function handleReset() {
    primeRevealAudio();
    setRevealRotationStepsByEdge({});
    setIsRevealingSpell(false);
    setRevealedSpellName(null);
    setDrawnEdges(new Set());
  }

  function formatVisibleNodeEdge(edge: NormalizedEdge): string {
    const { a, b } = denormalizeEdge(edge);
    return `Nodes ${a + 1}-${b + 1}`;
  }

  function getEdgeAttribute(edge: NormalizedEdge) {
    const { skip } = edgeToSkipStart(edge);
    return ATTRIBUTE_DEFINITIONS.find((attribute) => attribute.skip === skip);
  }

  return (
    <main className="app-shell min-h-screen">
      <div className="app-backdrop absolute inset-0" />
      <div className="relative mx-auto flex min-h-screen w-full max-w-7xl flex-col items-center gap-8 px-4 py-8 sm:px-6 lg:px-8">
        <SpellResult
          spell={visibleSpell}
          isRevealing={isRevealingSpell}
          possibleSpellCount={possibleSpellCount}
        />

        <div
          className={[
            'grid w-full items-start gap-6',
            SHOW_DRAWN_EDGE_DEBUG ? 'lg:grid-cols-[1fr_18rem]' : 'lg:grid-cols-1',
          ].join(' ')}
        >
          <div className="flex justify-center">
            <GlyphBoard
              drawnEdges={drawnEdges}
              canToggleEdge={canToggleEdge}
              isRevealing={isRevealingSpell}
              isRevealLocked={isRevealingSpell && Boolean(visibleSpell)}
              revealRotationStepsByEdge={revealRotationStepsByEdge}
              onToggleEdge={handleToggleEdge}
              onNormalize={visibleSpell ? handleNormalize : undefined}
              onReset={handleReset}
            />
          </div>

          {SHOW_DRAWN_EDGE_DEBUG ? (
            <aside className="debug-panel rounded-lg border p-4 shadow-glyph">
              <h2 className="font-display text-lg font-semibold text-[var(--text-title)]">Drawn Edges</h2>
              <div className="debug-panel-inner mt-3 min-h-32 rounded-md border p-3">
                {sortedDrawnEdges.length > 0 ? (
                  <ol className="grid gap-2 text-sm text-[var(--text-body)]">
                    {sortedDrawnEdges.map((edge) => {
                      const { skip } = edgeToSkipStart(edge);
                      const attribute = getEdgeAttribute(edge);

                      return (
                        <li key={edge} className="debug-edge-item rounded border px-2 py-1.5">
                          <span className="flex items-center gap-2 font-semibold text-[var(--text-title)]">
                            <span
                              aria-hidden="true"
                              className="h-2.5 w-2.5 rounded-full"
                              style={{ backgroundColor: ATTRIBUTE_ACCENTS[skip] }}
                            />
                            {formatVisibleNodeEdge(edge)}
                          </span>
                          <span className="block text-xs text-[var(--text-muted)]">
                            {attribute?.label ?? 'Unknown attribute'}
                          </span>
                          <span className="block font-mono text-xs text-[var(--text-faint)]">debug {edge}</span>
                        </li>
                      );
                    })}
                  </ol>
                ) : (
                  <p className="text-sm text-[var(--text-faint)]">No lines drawn.</p>
                )}
              </div>
            </aside>
          ) : null}
        </div>
      </div>
    </main>
  );
}

export default App;
