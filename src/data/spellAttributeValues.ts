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
  "Acid",
  "Cold",
  "Fire",
  "Force",
  "Lightning",
  "Necrotic",
  "Poison",
  "Psychic",
  "Radiant",
  "Thunder",
  "Bludgeoning",
  "Slashing",
  "Piercing",
  "Ward",
  "Healing",
  "Frightened",
  "Charmed",
  "Blinded",
  "Unconscious",
  "Incapacitated",
  "Paralyzed",
  "Teleportation",
  "Negation",
  "Invisible",
  "Restrained",
  "Acid, Cold, Fire, Lighting, Poison, or Thunder",
  "Cold and Piercing",
  "Blinded or Deafened",
  "Acid, Cold, Fire, Lighting, or Poison",
  "Charmed, Blinded, or Incapacitated",
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
  "Square",
  "Point",
] as const;

export const SPELL_RANGES = [
  "Self",
  "Touch",
  "5 feet",
  "10 feet",
  "15 feet",
  "30 feet",
  "60 feet",
  "90 feet",
  "120 feet",
  "300 feet",
  "Sight",
  "Long",
] as const;

export const SPELL_DURATIONS = [
  "Instantaneous",
  "1 round",
  "1 minute",
  "10 minutes",
  "1 hour",
  "8 hours",
  "24 hours",
  "10 days",
  "Until dispelled",
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
