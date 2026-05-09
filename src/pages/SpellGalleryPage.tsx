import { GlyphDiagram } from '../components/GlyphDiagram';
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

      <div className="mt-8 grid w-full gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {SORTED_SPELLS.map((spell) => (
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
              <h2 className="font-display text-xl font-semibold text-[var(--text-title)]">{spell.name}</h2>
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
    </section>
  );
}
