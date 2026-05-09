import type { Spell } from '../types';

export const SPELLS: Spell[] = [
  {
    name: 'Fireball',
    level: '3rd',
    school: 'Evocation',
    damageOrCondition: 'Fire',
    area: 'Sphere',
    range: 'Long',
    duration: 'Instantaneous',
  },
  {
    name: 'Magic Missile',
    level: '1st', // 1
    school: 'Evocation', // 111
    damageOrCondition: 'Force', // 1
    area: 'Multi-target', // 101
    range: '120 feet', // 111
    duration: 'Instantaneous', // 0
  },
  {
    name: 'Shield',
    level: '1st',
    school: 'Abjuration',
    damageOrCondition: 'Ward',
    area: 'Self',
    range: 'Self',
    duration: '1 round',
  },
  {
    name: 'Cure Wounds',
    level: '1st',
    school: 'Evocation',
    damageOrCondition: 'Healing',
    area: 'Touch',
    range: 'Touch',
    duration: 'Instantaneous',
  },
  {
    name: 'Thunderwave',
    level: '1st',
    school: 'Evocation',
    damageOrCondition: 'Thunder',
    area: 'Cube',
    range: 'Self',
    duration: 'Instantaneous',
  },
  {
    name: 'Hold Person',
    level: '2nd',
    school: 'Enchantment',
    damageOrCondition: 'Paralyzed',
    area: 'Single target',
    range: '60 feet',
    duration: '1 minute',
  },
  {
    name: 'Misty Step',
    level: '2nd',
    school: 'Conjuration',
    damageOrCondition: 'Teleportation',
    area: 'Self',
    range: 'Self',
    duration: 'Instantaneous',
  },
  {
    name: 'Counterspell',
    level: '3rd',
    school: 'Abjuration',
    damageOrCondition: 'Negation',
    area: 'Reaction trigger',
    range: '60 feet',
    duration: 'Instantaneous',
  },
  {
    name: 'Lightning Bolt',
    level: '3rd',
    school: 'Evocation',
    damageOrCondition: 'Lightning',
    area: 'Line',
    range: 'Self',
    duration: 'Instantaneous',
  },
  {
    name: 'Invisibility',
    level: '2nd',
    school: 'Illusion',
    damageOrCondition: 'Invisible',
    area: 'Single target',
    range: 'Touch',
    duration: '1 hour',
  },
];
