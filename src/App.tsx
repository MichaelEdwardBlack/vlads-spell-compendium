import { useEffect, useMemo, useState } from 'react';
import type { MouseEvent } from 'react';
import { BookOpen, Grid3X3, Wand2 } from 'lucide-react';
import { GlyphBoard } from './components/GlyphBoard';
import { SpellResult } from './components/SpellResult';
import { AttributeKeysPage } from './pages/AttributeKeysPage';
import { SpellGalleryPage } from './pages/SpellGalleryPage';
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

type RouteId = 'caster' | 'gallery' | 'keys';

const ROUTES: readonly {
  id: RouteId;
  path: string;
  label: string;
  Icon: typeof Wand2;
}[] = [
  { id: 'caster', path: '/', label: 'Cast', Icon: Wand2 },
  { id: 'gallery', path: '/gallery', label: 'Gallery', Icon: Grid3X3 },
  { id: 'keys', path: '/keys', label: 'Keys', Icon: BookOpen },
];

function getRouteId(pathname: string): RouteId {
  if (pathname === '/gallery') {
    return 'gallery';
  }

  if (pathname === '/keys') {
    return 'keys';
  }

  return 'caster';
}

function useRouteId(): RouteId {
  const [routeId, setRouteId] = useState<RouteId>(() => getRouteId(window.location.pathname));

  useEffect(() => {
    function handleNavigation() {
      setRouteId(getRouteId(window.location.pathname));
    }

    window.addEventListener('popstate', handleNavigation);

    return () => window.removeEventListener('popstate', handleNavigation);
  }, []);

  return routeId;
}

function PrimaryNavigation({ currentRoute }: { currentRoute: RouteId }) {
  function handleNavigate(event: MouseEvent<HTMLAnchorElement>, path: string) {
    event.preventDefault();
    window.history.pushState(null, '', path);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }

  return (
    <nav className="site-nav rounded-lg border px-2 py-2 shadow-glyph" aria-label="Primary navigation">
      <div className="flex flex-wrap items-center justify-center gap-2">
        {ROUTES.map(({ id, path, label, Icon }) => (
          <a
            key={id}
            href={path}
            onClick={(event) => handleNavigate(event, path)}
            aria-current={currentRoute === id ? 'page' : undefined}
            className={[
              'site-nav-link inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-semibold transition',
              'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4',
              currentRoute === id ? 'site-nav-link-active' : '',
            ].join(' ')}
          >
            <Icon aria-hidden="true" size={16} />
            {label}
          </a>
        ))}
      </div>
    </nav>
  );
}

function CasterPage() {
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
    <>
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
    </>
  );
}

function App() {
  const routeId = useRouteId();

  return (
    <main className="app-shell min-h-screen">
      <div className="app-backdrop absolute inset-0" />
      <div className="relative mx-auto flex min-h-screen w-full max-w-7xl flex-col items-center gap-8 px-4 py-8 sm:px-6 lg:px-8">
        <PrimaryNavigation currentRoute={routeId} />
        {routeId === 'gallery' ? <SpellGalleryPage /> : routeId === 'keys' ? <AttributeKeysPage /> : <CasterPage />}
      </div>
    </main>
  );
}

export default App;
