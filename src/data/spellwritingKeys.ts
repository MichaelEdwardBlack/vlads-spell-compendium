import type { SpellAttribute, SpellwritingAttributeDefinition } from '../types';
import { generateBinaryNecklaces } from '../utils/necklaces';

const KEY_LENGTH = 13;

export const SPELLWRITING_NECKLACES = generateBinaryNecklaces(KEY_LENGTH);

type AttributeSeed = {
  id: SpellAttribute;
  label: string;
  skip: number;
  values: readonly string[];
};

const ATTRIBUTE_SEEDS: readonly AttributeSeed[] = [
  {
    id: 'level',
    label: 'Level',
    skip: 0,
    values: ['Cantrip', '1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th', '9th'],
  },
  {
    id: 'school',
    label: 'School',
    skip: 1,
    values: [
      'Abjuration',
      'Conjuration',
      'Divination',
      'Enchantment',
      'Evocation',
      'Illusion',
      'Necromancy',
      'Transmutation',
    ],
  },
  {
    id: 'damageOrCondition',
    label: 'Damage or Condition',
    skip: 2,
    values: [
      'Fire',
      'Force',
      'Ward',
      'Healing',
      'Thunder',
      'Paralyzed',
      'Teleportation',
      'Negation',
      'Lightning',
      'Invisible',
    ],
  },
  {
    id: 'area',
    label: 'Area',
    skip: 3,
    values: ['Self', 'Touch', 'Single target', 'Multi-target', 'Sphere', 'Cube', 'Line', 'Reaction trigger'],
  },
  {
    id: 'range',
    label: 'Range',
    skip: 4,
    values: ['Self', 'Touch', '60 feet', '90 feet', '120 feet', 'Long'],
  },
  {
    id: 'duration',
    label: 'Duration',
    skip: 5,
    values: ['Instantaneous', '1 round', '1 minute', '1 hour'],
  },
] as const;

function assignSequentialKeys(values: readonly string[]): Record<string, string> {
  if (values.length > SPELLWRITING_NECKLACES.length) {
    throw new Error(`Cannot assign ${values.length} values from ${KEY_LENGTH}-bit necklace list.`);
  }

  return Object.fromEntries(
    values.map((value, index) => [value, SPELLWRITING_NECKLACES[index]]),
  );
}

export const ATTRIBUTE_DEFINITIONS: readonly SpellwritingAttributeDefinition[] = ATTRIBUTE_SEEDS.map(
  (attribute) => ({
    id: attribute.id,
    label: attribute.label,
    skip: attribute.skip,
    values: attribute.values,
    keys: assignSequentialKeys(attribute.values),
  }),
);

export const SPELLWRITING_KEYS: Record<SpellAttribute, Record<string, string>> = Object.fromEntries(
  ATTRIBUTE_DEFINITIONS.map((attribute) => [attribute.id, attribute.keys]),
) as Record<SpellAttribute, Record<string, string>>;
