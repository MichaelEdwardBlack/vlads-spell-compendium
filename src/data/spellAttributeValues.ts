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
  "None", // 0
  "Acid", // 1
  "Cold", // 11
  "Fire", // 101
  "Force", // 111
  "Lightning", // 1001
  "Necrotic", // 1011
  "Poison", // 1101
  "Psychic", // 1111
  "Radiant", // 10001
  "Thunder", // 10011
  "Ward", // 10101
  "Healing", // 10111
  "Paralyzed", // 11001
  "Teleportation", // 11011
  "Negation", // 11101
  "Invisible", // 11111
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
  "Cone",
] as const;

export const SPELL_RANGES = ["Self", "Touch", "10 feet", "30 feet", "60 feet", "90 feet", "120 feet", "Long"] as const;

export const SPELL_DURATIONS = [
  "Instantaneous",
  "1 round",
  "1 minute",
  "10 minutes",
  "1 hour",
  "8 hours",
  "24 hours",
  "10 days",
] as const;

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
