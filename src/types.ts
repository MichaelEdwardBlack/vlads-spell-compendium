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

export type Spell = Record<SpellAttribute, string> & {
  name: string;
};

export type SpellwritingAttributeDefinition = {
  id: SpellAttribute;
  label: string;
  skip: number;
  values: readonly string[];
  keys: Record<string, string>;
};
