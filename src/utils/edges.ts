import { ATTRIBUTE_DEFINITIONS } from '../data/spellwritingKeys';
import type { Edge, NormalizedEdge, Spell } from '../types';
import { canonicalRotation } from './necklaces';

const NODE_COUNT = 13;
const EMPTY_BITSTRING = '0'.repeat(NODE_COUNT);

export function normalizeEdge(a: number, b: number): NormalizedEdge {
  const low = Math.min(a, b);
  const high = Math.max(a, b);

  return `${low}-${high}`;
}

export function denormalizeEdge(edge: NormalizedEdge): Edge {
  const [a, b] = edge.split('-').map(Number);
  return { a, b };
}

export function bitstringToEdges(bitstring: string, skip: number): Edge[] {
  const step = skip + 1;

  return bitstring
    .split('')
    .flatMap((bit, index) =>
      bit === '1'
        ? [
            {
              a: index,
              b: (index + step) % NODE_COUNT,
            },
          ]
        : [],
    );
}

export function edgeToSkipStart(edge: NormalizedEdge): { skip: number; start: number } {
  const { a, b } = denormalizeEdge(edge);

  for (let step = 1; step <= Math.floor(NODE_COUNT / 2); step += 1) {
    if ((a + step) % NODE_COUNT === b) {
      return { skip: step - 1, start: a };
    }

    if ((b + step) % NODE_COUNT === a) {
      return { skip: step - 1, start: b };
    }
  }

  throw new Error(`Invalid edge for ${NODE_COUNT}-node glyph: ${edge}`);
}

export function edgesToCanonicalBitstringForSkip(
  edges: Iterable<NormalizedEdge>,
  skip: number,
): string {
  const bits = Array.from(EMPTY_BITSTRING);

  for (const edge of edges) {
    const edgePosition = edgeToSkipStart(edge);

    if (edgePosition.skip === skip) {
      bits[edgePosition.start] = '1';
    }
  }

  return canonicalRotation(bits.join(''));
}

export function spellToRequiredCanonicalKeys(spell: Spell): Record<string, string> {
  return Object.fromEntries(
    ATTRIBUTE_DEFINITIONS.map((attribute) => {
      const value = spell[attribute.id];
      const bitstring = attribute.keys[value];

      if (!bitstring) {
        throw new Error(`Missing spellwriting key for ${attribute.id}: ${value}`);
      }

      return [attribute.id, canonicalRotation(bitstring)];
    }),
  );
}

export function spellToRequiredEdges(spell: Spell): Edge[] {
  return ATTRIBUTE_DEFINITIONS.flatMap((attribute) => {
    const value = spell[attribute.id];
    const bitstring = attribute.keys[value];

    if (!bitstring) {
      throw new Error(`Missing spellwriting key for ${attribute.id}: ${value}`);
    }

    return bitstringToEdges(bitstring, attribute.skip);
  });
}

export function spellToRequiredNormalizedEdges(spell: Spell): NormalizedEdge[] {
  return uniqueNormalizedEdges(spellToRequiredEdges(spell));
}

export function uniqueNormalizedEdges(edges: Edge[]): NormalizedEdge[] {
  return Array.from(new Set(edges.map((edge) => normalizeEdge(edge.a, edge.b)))).sort();
}

export function edgeSetsAreEqual(left: Iterable<NormalizedEdge>, right: Iterable<NormalizedEdge>): boolean {
  const leftSet = new Set(left);
  const rightSet = new Set(right);

  if (leftSet.size !== rightSet.size) {
    return false;
  }

  for (const edge of leftSet) {
    if (!rightSet.has(edge)) {
      return false;
    }
  }

  return true;
}
