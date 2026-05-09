import { SPELLS } from '../data/spells';
import type { NormalizedEdge, Spell } from '../types';
import { ATTRIBUTE_DEFINITIONS } from '../data/spellwritingKeys';
import {
  edgeToSkipStart,
  edgesToCanonicalBitstringForSkip,
  spellToRequiredCanonicalKeys,
  spellToRequiredNormalizedEdges,
} from './edges';

const REQUIRED_EDGE_CACHE = new Map<string, NormalizedEdge[]>();

export function getRequiredEdgesForSpell(spell: Spell): NormalizedEdge[] {
  const cached = REQUIRED_EDGE_CACHE.get(spell.name);

  if (cached) {
    return cached;
  }

  const requiredEdges = spellToRequiredNormalizedEdges(spell);
  REQUIRED_EDGE_CACHE.set(spell.name, requiredEdges);

  return requiredEdges;
}

export function findExactSpellMatch(drawnEdges: Iterable<NormalizedEdge>): Spell | undefined {
  const drawnEdgeList = [...drawnEdges];

  return SPELLS.find((spell) => {
    const requiredKeys = spellToRequiredCanonicalKeys(spell);

    return ATTRIBUTE_DEFINITIONS.every((attribute) => {
      const drawnKey = edgesToCanonicalBitstringForSkip(drawnEdgeList, attribute.skip);
      return drawnKey === requiredKeys[attribute.id];
    });
  });
}

export function findPossibleMatchingSpellsFromPartialDrawnEdges(
  drawnEdges: Iterable<NormalizedEdge>,
): Spell[] {
  const drawnEdgeList = [...drawnEdges];

  return SPELLS.filter((spell) => spellCanContainPartialEdges(spell, drawnEdgeList));
}

export function countPossibleMatchingSpellsFromPartialDrawnEdges(drawnEdges: Iterable<NormalizedEdge>): number {
  return findPossibleMatchingSpellsFromPartialDrawnEdges(drawnEdges).length;
}

export function detectInvalidLinesForRemainingPossibleSpells(
  drawnEdges: Iterable<NormalizedEdge>,
): NormalizedEdge[] {
  const drawnEdgeList = [...drawnEdges];
  const remainingPossibleSpells = findPossibleMatchingSpellsFromPartialDrawnEdges(drawnEdgeList);

  if (remainingPossibleSpells.length > 0) {
    return [];
  }

  return drawnEdgeList.filter((edge) => {
    const withoutEdge = drawnEdgeList.filter((candidate) => candidate !== edge);
    return countPossibleMatchingSpellsFromPartialDrawnEdges(withoutEdge) > 0;
  });
}

export function countMissingLinesPerAttribute(
  spell: Spell,
  drawnEdges: Iterable<NormalizedEdge>,
): Record<string, number> {
  const drawnEdgeList = [...drawnEdges];
  const requiredKeys = spellToRequiredCanonicalKeys(spell);

  return Object.fromEntries(
    ATTRIBUTE_DEFINITIONS.map((attribute) => {
      const drawnKey = edgesToCanonicalBitstringForSkip(drawnEdgeList, attribute.skip);
      const requiredKey = requiredKeys[attribute.id];

      if (drawnKey === requiredKey) {
        return [attribute.id, 0];
      }

      const drawnLineCount = countBits(drawnKey);
      const requiredLineCount = countBits(requiredKey);

      return [attribute.id, Math.max(requiredLineCount - drawnLineCount, 0)];
    }),
  );
}

function spellCanContainPartialEdges(spell: Spell, drawnEdges: NormalizedEdge[]): boolean {
  const requiredKeys = spellToRequiredCanonicalKeys(spell);

  return ATTRIBUTE_DEFINITIONS.every((attribute) => {
    const startsForSkip = drawnEdges
      .map((edge) => edgeToSkipStart(edge))
      .filter((edgePosition) => edgePosition.skip === attribute.skip)
      .map((edgePosition) => edgePosition.start);

    return startsCanFitCanonicalKey(startsForSkip, requiredKeys[attribute.id]);
  });
}

function startsCanFitCanonicalKey(starts: number[], canonicalKey: string): boolean {
  if (starts.length === 0) {
    return true;
  }

  if (starts.length > countBits(canonicalKey)) {
    return false;
  }

  return rotations(canonicalKey).some((rotation) => starts.every((start) => rotation[start] === '1'));
}

function rotations(bitstring: string): string[] {
  return Array.from({ length: bitstring.length }, (_, offset) => bitstring.slice(offset) + bitstring.slice(0, offset));
}

function countBits(bitstring: string): number {
  return bitstring.replaceAll('0', '').length;
}
