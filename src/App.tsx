import { useMemo, useState } from 'react';
import { GlyphBoard } from './components/GlyphBoard';
import { SpellResult } from './components/SpellResult';
import type { NormalizedEdge } from './types';
import {
  countPossibleMatchingSpellsFromPartialDrawnEdges,
  findExactSpellMatch,
} from './utils/spellMatching';
import { denormalizeEdge } from './utils/edges';

function App() {
  const [drawnEdges, setDrawnEdges] = useState<Set<NormalizedEdge>>(() => new Set());
  const matchedSpell = useMemo(() => findExactSpellMatch(drawnEdges), [drawnEdges]);
  const possibleSpellCount = useMemo(
    () => countPossibleMatchingSpellsFromPartialDrawnEdges(drawnEdges),
    [drawnEdges],
  );
  const sortedDrawnEdges = useMemo(() => [...drawnEdges].sort(), [drawnEdges]);

  function handleToggleEdge(edge: NormalizedEdge) {
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

  function formatVisibleNodeEdge(edge: NormalizedEdge): string {
    const { a, b } = denormalizeEdge(edge);
    return `Nodes ${a + 1}-${b + 1}`;
  }

  return (
    <main className="min-h-screen bg-[#080705] text-stone-100">
      <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(68,23,23,0.32),rgba(8,7,5,0)_32%),radial-gradient(circle_at_82%_12%,rgba(14,83,67,0.24),rgba(8,7,5,0)_28%)]" />
      <div className="relative mx-auto flex min-h-screen w-full max-w-7xl flex-col items-center gap-8 px-4 py-8 sm:px-6 lg:px-8">
        <SpellResult spell={matchedSpell} />

        <div className="grid w-full items-start gap-6 lg:grid-cols-[1fr_18rem]">
          <div className="flex justify-center">
            <GlyphBoard
              drawnEdges={drawnEdges}
              canToggleEdge={canToggleEdge}
              onToggleEdge={handleToggleEdge}
              onReset={() => setDrawnEdges(new Set())}
            />
          </div>

          <aside className="rounded-lg border border-amber-200/15 bg-[#16110d]/88 p-4 shadow-glyph">
            <h2 className="font-display text-lg font-semibold text-amber-100">Drawn Edges</h2>
            <p className="mt-1 text-sm text-stone-400">
              {possibleSpellCount} possible {possibleSpellCount === 1 ? 'spell' : 'spells'}
            </p>
            <div className="mt-3 min-h-32 rounded-md border border-stone-500/20 bg-black/20 p-3">
              {sortedDrawnEdges.length > 0 ? (
                <ol className="grid gap-2 text-sm text-stone-300">
                  {sortedDrawnEdges.map((edge) => (
                    <li
                      key={edge}
                      className="rounded border border-amber-100/10 bg-amber-100/5 px-2 py-1.5"
                    >
                      <span className="block font-semibold text-amber-100">{formatVisibleNodeEdge(edge)}</span>
                      <span className="block font-mono text-xs text-stone-500">debug {edge}</span>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="text-sm text-stone-500">No lines drawn.</p>
              )}
            </div>
          </aside>
        </div>
      </div>
    </main>
  );
}

export default App;
