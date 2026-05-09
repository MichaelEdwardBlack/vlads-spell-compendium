import type { SpellAttribute, SpellAttributeValueByAttribute, SpellwritingAttributeDefinition } from '../types';
import { generateBinaryNecklaces } from '../utils/necklaces';
import {
  SPELL_AREAS,
  SPELL_DAMAGE_OR_CONDITIONS,
  SPELL_DURATIONS,
  SPELL_LEVELS,
  SPELL_RANGES,
  SPELL_SCHOOLS,
} from './spellAttributeValues';

const KEY_LENGTH = 13;

export const SPELLWRITING_NECKLACES = generateBinaryNecklaces(KEY_LENGTH);

type AttributeSeed = {
  [Attribute in SpellAttribute]: {
    id: Attribute;
    label: string;
    skip: number;
    values: readonly SpellAttributeValueByAttribute[Attribute][];
  };
}[SpellAttribute];

const ATTRIBUTE_SEEDS: readonly AttributeSeed[] = [
  {
    id: 'level',
    label: 'Level',
    skip: 0,
    values: SPELL_LEVELS,
  },
  {
    id: 'school',
    label: 'School',
    skip: 1,
    values: SPELL_SCHOOLS,
  },
  {
    id: 'damageOrCondition',
    label: 'Damage or Condition',
    skip: 2,
    values: SPELL_DAMAGE_OR_CONDITIONS,
  },
  {
    id: 'area',
    label: 'Area',
    skip: 3,
    values: SPELL_AREAS,
  },
  {
    id: 'range',
    label: 'Range',
    skip: 4,
    values: SPELL_RANGES,
  },
  {
    id: 'duration',
    label: 'Duration',
    skip: 5,
    values: SPELL_DURATIONS,
  },
] as const;

function assignSequentialKeys(values: readonly (string | number)[]): Record<string, string> {
  if (values.length > SPELLWRITING_NECKLACES.length) {
    throw new Error(`Cannot assign ${values.length} values from ${KEY_LENGTH}-bit necklace list.`);
  }

  return Object.fromEntries(
    values.map((value, index) => [String(value), SPELLWRITING_NECKLACES[index]]),
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
