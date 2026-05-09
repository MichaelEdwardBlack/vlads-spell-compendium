import { GlyphDiagram, GLYPH_LINE_COLORS } from '../components/GlyphDiagram';
import { ATTRIBUTE_DEFINITIONS } from '../data/spellwritingKeys';
import type { NormalizedEdge } from '../types';
import { bitstringToEdges, denormalizeEdge, uniqueNormalizedEdges } from '../utils/edges';

function getEdgesForKey(bitstring: string, skip: number): NormalizedEdge[] {
  return uniqueNormalizedEdges(bitstringToEdges(bitstring, skip));
}

function formatEdge(edge: NormalizedEdge): string {
  const { a, b } = denormalizeEdge(edge);
  return `${a + 1}-${b + 1}`;
}

export function AttributeKeysPage() {
  return (
    <section className="w-full">
      <header className="mx-auto max-w-3xl text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--text-rune)]">
          Spellwriting Key
        </p>
        <h1 className="mt-3 font-display text-4xl font-semibold text-[var(--text-title)] sm:text-5xl">
          Attribute Mappings
        </h1>
        <p className="mt-3 text-sm text-[var(--text-muted)]">
          Each value maps to a 13-bit necklace and the glyph lines drawn for that attribute.
        </p>
      </header>

      <div className="mt-8 grid gap-8">
        {ATTRIBUTE_DEFINITIONS.map((attribute) => (
          <section key={attribute.id} className="attribute-section rounded-lg border p-4 shadow-glyph sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-display text-2xl font-semibold text-[var(--text-title)]">
                  {attribute.label}
                </h2>
                <p className="mt-1 text-sm text-[var(--text-muted)]">
                  Skip {attribute.skip} · step {attribute.skip + 1}
                </p>
              </div>
              <span
                aria-hidden="true"
                className="h-3 w-16 rounded-full"
                style={{ backgroundColor: GLYPH_LINE_COLORS[attribute.skip] }}
              />
            </div>

            <div className="mt-4 grid gap-3">
              {attribute.values.map((value) => {
                const bitstring = attribute.keys[String(value)];
                const edges = getEdgesForKey(bitstring, attribute.skip);

                return (
                  <article key={String(value)} className="key-row rounded-md border p-3">
                    <div className="grid gap-4 md:grid-cols-[8rem_1fr] md:items-center">
                      <div className="key-glyph-frame aspect-square rounded-md border">
                        <GlyphDiagram
                          edges={edges}
                          label={`${attribute.label} ${String(value)} glyph lines`}
                          className="h-full w-full"
                          strokeWidth={4}
                        />
                      </div>
                      <div className="min-w-0">
                        <h3 className="text-base font-semibold text-[var(--text-title)]">{String(value)}</h3>
                        <div className="mt-3 flex flex-wrap gap-1.5" aria-label="Binary representation">
                          {bitstring.split('').map((bit, index) => (
                            <span
                              key={`${bit}-${index}`}
                              className={[
                                'binary-bit flex h-7 w-6 items-center justify-center rounded border font-mono text-xs font-semibold',
                                bit === '1' ? 'binary-bit-on' : 'binary-bit-off',
                              ].join(' ')}
                            >
                              {bit}
                            </span>
                          ))}
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2">
                          {edges.length > 0 ? (
                            edges.map((edge) => (
                              <span key={edge} className="line-chip rounded border px-2 py-1 font-mono text-xs">
                                {formatEdge(edge)}
                              </span>
                            ))
                          ) : (
                            <span className="text-xs text-[var(--text-faint)]">No glyph lines</span>
                          )}
                        </div>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </section>
  );
}
