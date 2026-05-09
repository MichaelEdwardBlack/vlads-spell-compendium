export const SPELL_LEVELS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9] as const;

export const SPELL_SCHOOLS = [
  "Abjuration",
  "Conjuration",
  "Divination",
  "Enchantment",
  "Evocation",
  "Illusion",
  "Necromancy",
  "Transmutation",
] as const;

export const SPELL_DAMAGE_OR_CONDITIONS = [
  "None",
  "Fire",
  "Cold",
  "Acid",
  "Force",
  "Ward",
  "Healing",
  "Thunder",
  "Paralyzed",
  "Teleportation",
  "Negation",
  "Lightning",
  "Invisible",
] as const;

export const SPELL_AREAS = [
  "None",
  "Self",
  "Touch",
  "Single target",
  "Multi-target",
  "Sphere",
  "Cube",
  "Line",
  "Reaction trigger",
] as const;

export const SPELL_RANGES = ["Self", "Touch", "10 feet", "60 feet", "90 feet", "120 feet", "Long"] as const;

export const SPELL_DURATIONS = ["Instantaneous", "1 round", "1 minute", "1 hour"] as const;

export type SpellLevel = (typeof SPELL_LEVELS)[number];
export type SpellSchool = (typeof SPELL_SCHOOLS)[number];
export type SpellDamageOrCondition = (typeof SPELL_DAMAGE_OR_CONDITIONS)[number];
export type SpellArea = (typeof SPELL_AREAS)[number];
export type SpellRange = (typeof SPELL_RANGES)[number];
export type SpellDuration = (typeof SPELL_DURATIONS)[number];

export type SpellAttributeValue =
  | SpellLevel
  | SpellSchool
  | SpellDamageOrCondition
  | SpellArea
  | SpellRange
  | SpellDuration;
