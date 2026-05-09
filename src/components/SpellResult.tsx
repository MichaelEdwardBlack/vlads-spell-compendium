import type { Spell } from '../types';

type SpellResultProps = {
  spell?: Spell;
};

export function SpellResult({ spell }: SpellResultProps) {
  return (
    <section className="min-h-24 text-center" aria-live="polite">
      <p className="text-xs font-semibold uppercase tracking-[0.24em] text-amber-200/70">
        Divination Result
      </p>
      <h1 className="mt-3 font-display text-4xl font-semibold text-amber-100 sm:text-5xl">
        {spell?.name ?? 'Unknown spell'}
      </h1>
      {spell ? (
        <p className="mt-3 text-sm text-stone-300">
          {spell.level} level {spell.school.toLowerCase()} · {spell.damageOrCondition} · {spell.area}
        </p>
      ) : (
        <p className="mt-3 text-sm text-stone-400">Complete a valid glyph to identify the spell.</p>
      )}
    </section>
  );
}
