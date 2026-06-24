import { Search, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { GlyphDiagram } from '../components/GlyphDiagram';
import { SpellDetailsLink } from '../components/SpellDetailsLink';
import { formatSpellLevel } from '../components/SpellResult';
import { SPELLS } from '../data/spells';
import { getRequiredEdgesForSpell } from '../utils/spellMatching';

const SORTED_SPELLS = [...SPELLS].sort((left, right) => {
  if (left.level !== right.level) {
    return left.level - right.level;
  }

  return left.name.localeCompare(right.name);
});

export function SpellGalleryPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const normalizedSearchQuery = searchQuery.trim().toLocaleLowerCase();
  const visibleSpells = useMemo(() => {
    if (!normalizedSearchQuery) {
      return SORTED_SPELLS;
    }

    return SORTED_SPELLS.filter((spell) => spell.name.toLocaleLowerCase().includes(normalizedSearchQuery));
  }, [normalizedSearchQuery]);

  return (
    <section className="w-full">
      <header className="mx-auto max-w-3xl text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--text-rune)]">
          Normalized Glyphs
        </p>
        <h1 className="mt-3 font-display text-4xl font-semibold text-[var(--text-title)] sm:text-5xl">
          Spell Gallery
        </h1>
        <p className="mt-3 text-sm text-[var(--text-muted)]">
          Every spell is shown in its canonical orientation for easy comparison.
        </p>
      </header>

      <div className="gallery-search mx-auto mt-8 max-w-2xl rounded-lg border p-3 shadow-glyph">
        <label htmlFor="spell-gallery-search" className="sr-only">
          Search spells
        </label>
        <div className="flex items-center gap-2">
          <Search aria-hidden="true" className="shrink-0 text-[var(--text-muted)]" size={18} />
          <input
            id="spell-gallery-search"
            type="search"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Search spells"
            className="gallery-search-input min-w-0 flex-1 bg-transparent text-sm text-[var(--text-title)] outline-none placeholder:text-[var(--text-faint)]"
          />
          {searchQuery ? (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="arcane-icon-button grid h-8 w-8 shrink-0 place-items-center rounded-md border transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4"
              aria-label="Clear spell search"
            >
              <X aria-hidden="true" size={16} />
            </button>
          ) : null}
        </div>
        <p className="mt-2 text-xs text-[var(--text-muted)]">
          Showing {visibleSpells.length} of {SORTED_SPELLS.length} spells
        </p>
      </div>

      <div className="mt-8 grid w-full gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {visibleSpells.map((spell) => (
          <article key={spell.name} className="gallery-card rounded-lg border p-4 shadow-glyph">
            <div className="gallery-glyph-frame aspect-square rounded-md border">
              <GlyphDiagram
                edges={getRequiredEdgesForSpell(spell)}
                label={`${spell.name} normalized glyph`}
                className="h-full w-full"
                strokeWidth={3.6}
                showNodes
              />
            </div>
            <div className="mt-4">
              <div className="flex items-start justify-between gap-3">
                <h2 className="min-w-0 font-display text-xl font-semibold text-[var(--text-title)]">{spell.name}</h2>
                <SpellDetailsLink spell={spell} className="shrink-0" />
              </div>
              <p className="mt-1 text-sm text-[var(--text-body)]">
                {formatSpellLevel(spell.level)} {spell.school.toLowerCase()}
              </p>
              <p className="mt-2 text-xs text-[var(--text-muted)]">
                {spell.damageOrCondition} · {spell.area} · {spell.range} · {spell.duration}
              </p>
            </div>
          </article>
        ))}
      </div>
      {visibleSpells.length === 0 ? (
        <div className="gallery-empty-state mx-auto mt-8 max-w-xl rounded-lg border p-6 text-center shadow-glyph">
          <h2 className="font-display text-2xl font-semibold text-[var(--text-title)]">No spells found</h2>
          <p className="mt-2 text-sm text-[var(--text-muted)]">Try a different spell name.</p>
        </div>
      ) : null}
    </section>
  );
}
