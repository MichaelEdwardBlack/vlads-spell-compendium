import type { Spell } from '../types';

type SpellResultProps = {
  spell?: Spell;
  isRevealing?: boolean;
  possibleSpellCount: number;
};

function formatSpellLevel(level: Spell['level']): string {
  if (level === 0) {
    return 'Cantrip';
  }

  const suffix = level === 1 ? 'st' : level === 2 ? 'nd' : level === 3 ? 'rd' : 'th';
  return `${level}${suffix} level`;
}

export function SpellResult({ spell, isRevealing = false, possibleSpellCount }: SpellResultProps) {
  return (
    <section className="min-h-24 text-center" aria-live="polite">
      <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--text-rune)]">
        {isRevealing ? 'Glyph Resonance' : 'Divination Result'}
      </p>
      <p className="mt-2 text-sm text-[var(--text-muted)]">
        {possibleSpellCount} possible {possibleSpellCount === 1 ? 'spell' : 'spells'}
      </p>
      <h1
        key={spell?.name ?? (isRevealing ? 'revealing' : 'unknown')}
        className={[
          'mt-3 font-display text-4xl font-semibold text-[var(--text-title)] sm:text-5xl',
          spell ? 'spell-name-reveal' : '',
          isRevealing && !spell ? 'spell-name-charging' : '',
        ].join(' ')}
      >
        {spell?.name ?? (isRevealing ? 'Revealing...' : 'Unknown spell')}
      </h1>
      {spell ? (
        <p className="spell-detail-reveal mt-3 text-sm text-[var(--text-body)]">
          {formatSpellLevel(spell.level)} {spell.school.toLowerCase()} · {spell.damageOrCondition} · {spell.area}
        </p>
      ) : isRevealing ? (
        <p className="mt-3 text-sm text-[var(--text-rune)]">The glyph is aligning into its true form.</p>
      ) : (
        <p className="mt-3 text-sm text-[var(--text-muted)]">Complete a valid glyph to identify the spell.</p>
      )}
    </section>
  );
}
