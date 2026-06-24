import { ExternalLink } from 'lucide-react';
import type { MouseEvent } from 'react';
import type { Spell } from '../types';

type SpellDetailsLinkProps = {
  spell: Spell;
  className?: string;
  onClick?: (event: MouseEvent<HTMLAnchorElement>) => void;
};

export function SpellDetailsLink({ spell, className = '', onClick }: SpellDetailsLinkProps) {
  return (
    <a
      href={spell.link}
      target="_blank"
      rel="noreferrer"
      onClick={onClick}
      className={[
        'spell-details-link inline-flex items-center justify-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4',
        className,
      ].join(' ')}
      aria-label={`Open ${spell.name} spell details`}
    >
      <span>Details</span>
      <ExternalLink aria-hidden="true" size={14} />
    </a>
  );
}
