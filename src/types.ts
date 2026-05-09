import type {
  SpellArea,
  SpellDamageOrCondition,
  SpellDuration,
  SpellLevel,
  SpellRange,
  SpellSchool,
} from './data/spellAttributeValues';

export type SpellAttribute =
  | 'level'
  | 'school'
  | 'damageOrCondition'
  | 'area'
  | 'range'
  | 'duration';

export type Edge = {
  a: number;
  b: number;
};

export type NormalizedEdge = `${number}-${number}`;

export type SpellAttributeValueByAttribute = {
  level: SpellLevel;
  school: SpellSchool;
  damageOrCondition: SpellDamageOrCondition;
  area: SpellArea;
  range: SpellRange;
  duration: SpellDuration;
};

export type Spell = SpellAttributeValueByAttribute & {
  name: string;
};

export type SpellwritingAttributeDefinition<Attribute extends SpellAttribute = SpellAttribute> = {
  id: Attribute;
  label: string;
  skip: number;
  values: readonly SpellAttributeValueByAttribute[Attribute][];
  keys: Record<string, string>;
};
