import { useEffect, useMemo, useRef, useState } from "react";
import type { MouseEvent } from "react";
import { BookOpen, ChevronDown, Grid3X3, Pause, Play, RotateCcw, Wand2 } from "lucide-react";
import { GlyphBoard } from "./components/GlyphBoard";
import { GlyphDiagram } from "./components/GlyphDiagram";
import { SpellDetailsLink } from "./components/SpellDetailsLink";
import { formatSpellLevel } from "./components/SpellResult";
import { AttributeKeysPage } from "./pages/AttributeKeysPage";
import { SpellGalleryPage } from "./pages/SpellGalleryPage";
import type { NormalizedEdge, Spell, SpellAttribute } from "./types";
import {
  countPossibleMatchingSpellsFromPartialDrawnEdges,
  findExactSpellMatch,
  getRequiredEdgesForSpell,
} from "./utils/spellMatching";
import {
  bitstringToEdges,
  denormalizeEdge,
  edgeToSkipStart,
  getNormalizationRotationStepsByEdge,
  normalizeDrawnEdges,
  uniqueNormalizedEdges,
} from "./utils/edges";
import { playSpellRevealSound, playTimerWarningSound, primeRevealAudio } from "./utils/revealSound";
import { ATTRIBUTE_DEFINITIONS } from "./data/spellwritingKeys";

const ATTRIBUTE_ACCENTS = [
  "var(--line-level)",
  "var(--line-school)",
  "var(--line-damage)",
  "var(--line-area)",
  "var(--line-range)",
  "var(--line-duration)",
] as const;
const ATTRIBUTE_LINE_COLOR_NAMES = ["gold", "teal", "blue", "pink", "violet", "green"] as const;
const SHOW_DRAWN_EDGE_DEBUG = import.meta.env.VITE_SHOW_DRAWN_EDGES === "true";
const GAME_DURATION_SECONDS = 180;

type RouteId = "caster" | "gallery" | "keys";
type GameStatus = "idle" | "running" | "paused" | "countdown" | "ended";
type HintAttribute = Exclude<SpellAttribute, "level">;

type CastHistoryEntry = {
  id: number;
  spell: Spell;
  castAt: Date;
};

type DiscoveredKeyEntry = {
  id: string;
  attributeId: HintAttribute;
  attributeLabel: string;
  value: string;
  edges: NormalizedEdge[];
};

type PendingSpellReward = {
  spell: Spell;
  shouldResetAfterHint: boolean;
};

type PendingKeyConflict = {
  key: DiscoveredKeyEntry;
  proposedEdges: NormalizedEdge[];
  canOverride: boolean;
};

const ROUTES: readonly {
  id: RouteId;
  path: string;
  label: string;
  Icon: typeof Wand2;
}[] = [
  { id: "caster", path: "/", label: "Cast", Icon: Wand2 },
  { id: "gallery", path: "/gallery", label: "Gallery", Icon: Grid3X3 },
  { id: "keys", path: "/keys", label: "Keys", Icon: BookOpen },
];

const HINT_ATTRIBUTE_DEFINITIONS = ATTRIBUTE_DEFINITIONS.filter(
  (attribute): attribute is (typeof ATTRIBUTE_DEFINITIONS)[number] & { id: HintAttribute } => attribute.id !== "level",
);

function getRouteId(pathname: string): RouteId {
  if (pathname === "/gallery") {
    return "gallery";
  }

  if (pathname === "/keys") {
    return "keys";
  }

  return "caster";
}

function useRouteId(): RouteId {
  const [routeId, setRouteId] = useState<RouteId>(() => getRouteId(window.location.pathname));

  useEffect(() => {
    function handleNavigation() {
      setRouteId(getRouteId(window.location.pathname));
    }

    window.addEventListener("popstate", handleNavigation);

    return () => window.removeEventListener("popstate", handleNavigation);
  }, []);

  return routeId;
}

function PrimaryNavigation({ currentRoute }: { currentRoute: RouteId }) {
  function handleNavigate(event: MouseEvent<HTMLAnchorElement>, path: string) {
    event.preventDefault();
    window.history.pushState(null, "", path);
    window.dispatchEvent(new PopStateEvent("popstate"));
  }

  return (
    <nav className="site-nav rounded-lg border px-2 py-2 shadow-glyph" aria-label="Primary navigation">
      <div className="flex flex-wrap items-center justify-center gap-2">
        {ROUTES.map(({ id, path, label, Icon }) => (
          <a
            key={id}
            href={path}
            onClick={(event) => handleNavigate(event, path)}
            aria-current={currentRoute === id ? "page" : undefined}
            className={[
              "site-nav-link inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-semibold transition",
              "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4",
              currentRoute === id ? "site-nav-link-active" : "",
            ].join(" ")}
          >
            <Icon aria-hidden="true" size={16} />
            {label}
          </a>
        ))}
      </div>
    </nav>
  );
}

function formatAttributeValue(attributeId: keyof Spell, value: Spell[keyof Spell]): string {
  if (attributeId === "level") {
    return formatSpellLevel(value as Spell["level"]);
  }

  return String(value);
}

function formatCastTime(castAt: Date): string {
  return castAt.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function formatRemainingTime(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function getHintAttributeLabel(attributeId: HintAttribute): string {
  return attributeId === "school"
    ? "School of Magic"
    : (ATTRIBUTE_DEFINITIONS.find((attribute) => attribute.id === attributeId)?.label ?? attributeId);
}

function getHintAttributeDefinition(attributeId: HintAttribute) {
  return HINT_ATTRIBUTE_DEFINITIONS.find((definition) => definition.id === attributeId);
}

function getHintLineColorName(attributeId: HintAttribute): string {
  const skip = getHintAttributeDefinition(attributeId)?.skip;

  return skip === undefined ? "matching" : ATTRIBUTE_LINE_COLOR_NAMES[skip];
}

function formatDiscoveredKeyValue(entry: DiscoveredKeyEntry): string {
  return entry.edges.length === 0 ? `No ${getHintLineColorName(entry.attributeId)} lines` : entry.value;
}

function getHintLineColor(entry: DiscoveredKeyEntry): string {
  const skip = getHintAttributeDefinition(entry.attributeId)?.skip;

  return skip === undefined ? "var(--border-strong)" : ATTRIBUTE_ACCENTS[skip];
}

function getEdgesForSpellAttribute(spell: Spell, attributeId: HintAttribute): NormalizedEdge[] {
  const attribute = getHintAttributeDefinition(attributeId);

  if (!attribute) {
    return [];
  }

  const bitstring = attribute.keys[String(spell[attributeId])];

  return uniqueNormalizedEdges(bitstringToEdges(bitstring, attribute.skip));
}

function getDiscoveredKeyId(attributeId: HintAttribute, value: string): string {
  return `${attributeId}:${value}`;
}

function applyHintKeyToEdges(
  currentEdges: Iterable<NormalizedEdge>,
  entry: DiscoveredKeyEntry,
): NormalizedEdge[] {
  const attribute = getHintAttributeDefinition(entry.attributeId);

  if (!attribute) {
    return [...currentEdges].sort();
  }

  return Array.from(
    new Set([...currentEdges].filter((edge) => edgeToSkipStart(edge).skip !== attribute.skip).concat(entry.edges)),
  ).sort() as NormalizedEdge[];
}

function getRequiredAttributeValuesForAppliedKeys(
  appliedKeys: readonly DiscoveredKeyEntry[],
): Partial<Record<SpellAttribute, string>> {
  return Object.fromEntries(appliedKeys.map((entry) => [entry.attributeId, entry.value]));
}

function getAppliedKeysWithEntry(
  appliedKeys: readonly DiscoveredKeyEntry[],
  entry: DiscoveredKeyEntry,
): readonly DiscoveredKeyEntry[] | null {
  const existingAttributeKey = appliedKeys.find((appliedKey) => appliedKey.attributeId === entry.attributeId);

  if (existingAttributeKey && existingAttributeKey.id !== entry.id) {
    return null;
  }

  if (existingAttributeKey) {
    return appliedKeys;
  }

  return [entry, ...appliedKeys];
}

function getLockedAttributeSkips(appliedKeys: readonly DiscoveredKeyEntry[]): ReadonlySet<number> {
  return new Set(
    appliedKeys.flatMap((entry) => {
      const attribute = getHintAttributeDefinition(entry.attributeId);
      return attribute ? [attribute.skip] : [];
    }),
  );
}

function GameHud({
  status,
  remainingSeconds,
  score,
  canToggleRound,
  onToggleRound,
  onReset,
}: {
  status: GameStatus;
  remainingSeconds: number;
  score: number;
  canToggleRound: boolean;
  onToggleRound: () => void;
  onReset: () => void;
}) {
  const isActive = status === "running" || status === "countdown";
  const isTimerWarning = status === "running" && remainingSeconds <= 10 && remainingSeconds > 3;
  const isTimerCritical = status === "running" && remainingSeconds <= 3;
  const RoundControlIcon = isActive ? Pause : Play;
  const roundControlLabel =
    status === "idle" || status === "ended" ? "Start round" : isActive ? "Pause round" : "Resume round";

  return (
    <section className="game-hud fixed inset-x-2 bottom-2 z-30 rounded-lg border p-4 shadow-glyph lg:sticky lg:inset-x-auto lg:top-2 lg:bottom-auto lg:w-full">
      <div className="grid gap-4 md:grid-cols-[1fr_auto_1fr] md:items-center">
        <div className="grid grid-cols-3 gap-3 text-center sm:max-w-xl md:col-start-2">
          <div
            className={[
              "game-stat rounded-md border px-3 py-2",
              isTimerCritical ? "game-stat-time-critical" : isTimerWarning ? "game-stat-time-warning" : "",
            ].join(" ")}
          >
            <span className="block text-xs font-semibold uppercase tracking-[0.16em] text-[var(--text-faint)]">
              Time
            </span>
            <span className="game-time-value mt-1 block font-display text-xl font-semibold text-[var(--text-title)] sm:text-2xl">
              {formatRemainingTime(remainingSeconds)}
            </span>
          </div>
          <div className="game-stat rounded-md border px-3 py-2">
            <span className="block text-xs font-semibold uppercase tracking-[0.16em] text-[var(--text-faint)]">
              Spells
            </span>
            <span className="mt-1 block font-display text-xl font-semibold text-[var(--text-title)] sm:text-2xl">
              {score}
            </span>
          </div>
          <div className="game-stat grid place-items-center rounded-md border px-3 py-2">
            <button
              type="button"
              onClick={onToggleRound}
              disabled={!canToggleRound}
              className="round-control-button inline-flex h-14 w-14 items-center justify-center rounded-md transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 disabled:cursor-not-allowed disabled:opacity-55 sm:h-16 sm:w-16"
              aria-label={roundControlLabel}
              title={roundControlLabel}
            >
              <RoundControlIcon aria-hidden="true" size={28} />
            </button>
          </div>
        </div>

        <div className="flex flex-wrap justify-center gap-3 md:justify-self-end">
          {status !== "idle" ? (
            <button
              type="button"
              onClick={onReset}
              className="arcane-button arcane-button-danger inline-flex items-center gap-2 rounded-md border px-4 py-2 text-sm font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4"
            >
              <RotateCcw aria-hidden="true" size={16} />
              Reset Round
            </button>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function SpellRewardPanel({
  reward,
  discoveredKeys,
  onChooseHint,
  onContinue,
}: {
  reward: PendingSpellReward;
  discoveredKeys: readonly DiscoveredKeyEntry[];
  onChooseHint: (attributeId: HintAttribute) => void;
  onContinue: () => void;
}) {
  const availableAttributes = HINT_ATTRIBUTE_DEFINITIONS.filter((attribute) => {
    const value = String(reward.spell[attribute.id]);
    return !discoveredKeys.some((entry) => entry.id === getDiscoveredKeyId(attribute.id, value));
  });
  const hasClaimableHint = availableAttributes.length > 0;

  return (
    <section className="spell-reward-panel w-full max-w-4xl rounded-lg border p-4 shadow-glyph sm:p-5">
      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--text-rune)]">Timer Paused</p>
      <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="pause-modal-title" className="font-display text-2xl font-semibold text-[var(--text-title)]">
            {reward.spell.name}
          </h2>
          <SpellDetailsLink spell={reward.spell} className="mt-3" />
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            Pick one eligible attribute key to add to your hint glyphs.
          </p>
        </div>
        {!hasClaimableHint ? (
          <div className="shrink-0">
            <button
              type="button"
              onClick={onContinue}
              className="hint-choice-button rounded-md border px-4 py-2 text-sm font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4"
            >
              Continue
            </button>
          </div>
        ) : null}
      </div>

      <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
        {ATTRIBUTE_DEFINITIONS.map((attribute) => {
          const value = formatAttributeValue(attribute.id, reward.spell[attribute.id]);
          const isHintAttribute = attribute.id !== "level";
          const hintAttributeId = attribute.id as HintAttribute;
          const isAlreadyDiscovered =
            isHintAttribute &&
            discoveredKeys.some(
              (entry) => entry.id === getDiscoveredKeyId(hintAttributeId, String(reward.spell[hintAttributeId])),
            );

          return (
            <div key={attribute.id} className="reward-attribute rounded-md border px-3 py-2">
              <dt className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--text-faint)]">
                {getHintAttributeLabel(attribute.id as HintAttribute)}
              </dt>
              <dd className="mt-1 flex min-w-0 flex-wrap items-center justify-between gap-2 text-[var(--text-body)]">
                <span className="min-w-0 break-words">{value}</span>
                {isHintAttribute && !isAlreadyDiscovered ? (
                  <button
                    type="button"
                    onClick={() => onChooseHint(hintAttributeId)}
                    className="hint-choice-button shrink-0 rounded-md border px-3 py-1.5 text-xs font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4"
                  >
                    Claim Key
                  </button>
                ) : (
                  <span className="hint-status-pill shrink-0 rounded-md border px-2 py-1 text-xs font-semibold">
                    {isHintAttribute ? "Known" : "No key"}
                  </span>
                )}
              </dd>
            </div>
          );
        })}
      </dl>
      {!hasClaimableHint ? (
        <p className="mt-3 text-xs text-[var(--text-muted)]">
          Every non-level key from this spell is already discovered.
        </p>
      ) : null}
    </section>
  );
}

function KeyConflictPanel({
  conflict,
  onOverride,
  onKeep,
}: {
  conflict: PendingKeyConflict;
  onOverride: () => void;
  onKeep: () => void;
}) {
  return (
    <section className="spell-reward-panel w-full max-w-2xl rounded-lg border p-4 shadow-glyph sm:p-5">
      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--text-rune)]">Timer Paused</p>
      <h2 id="key-conflict-title" className="mt-2 font-display text-2xl font-semibold text-[var(--text-title)]">
        No possible combination
      </h2>
      <p className="mt-2 text-sm text-[var(--text-muted)]">
        Applying {conflict.key.attributeLabel}: {formatDiscoveredKeyValue(conflict.key)} to your current glyph would
        leave no remaining spells.
      </p>
      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <button
          type="button"
          onClick={onOverride}
          disabled={!conflict.canOverride}
          className="hint-choice-button rounded-md border px-4 py-3 text-left transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 disabled:cursor-not-allowed disabled:opacity-55"
        >
          <span className="block text-sm font-semibold text-[var(--text-title)]">Override glyph</span>
          <span className="mt-1 block text-xs text-[var(--text-muted)]">
            Replace your current glyph with only this key.
          </span>
        </button>
        <button
          type="button"
          onClick={onKeep}
          className="hint-choice-button rounded-md border px-4 py-3 text-left transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4"
        >
          <span className="block text-sm font-semibold text-[var(--text-title)]">Keep current glyph</span>
          <span className="mt-1 block text-xs text-[var(--text-muted)]">
            Leave your lines exactly as they were before the hint.
          </span>
        </button>
      </div>
      {!conflict.canOverride ? (
        <p className="mt-3 text-xs text-[var(--text-muted)]">
          This key has no remaining spell route by itself, so override is unavailable.
        </p>
      ) : null}
    </section>
  );
}

function DiscoveredKeysPanel({
  keys,
  canApply,
  canApplyKey,
  isAppliedKey,
  onApplyKey,
}: {
  keys: readonly DiscoveredKeyEntry[];
  canApply: boolean;
  canApplyKey: (entry: DiscoveredKeyEntry) => boolean;
  isAppliedKey: (entry: DiscoveredKeyEntry) => boolean;
  onApplyKey: (entry: DiscoveredKeyEntry) => void;
}) {
  return (
    <section>
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--text-rune)]">Discovered Keys</p>
        <h2 className="mt-1 font-display text-xl font-semibold text-[var(--text-title)]">Hint Glyphs</h2>
      </div>

      <div className="mt-4 grid gap-3">
        {keys.length > 0 ? (
          keys.map((entry) => {
            const isApplied = isAppliedKey(entry);
            const isBlocked = !canApplyKey(entry);

            return (
              <button
                key={entry.id}
                type="button"
                onClick={() => onApplyKey(entry)}
                disabled={!canApply || isApplied || isBlocked}
                className="discovered-key-button rounded-md border p-3 text-left transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 disabled:cursor-not-allowed disabled:opacity-55"
              >
                <span className="grid grid-cols-[4.5rem_1fr] items-center gap-3">
                  <span className="cast-history-glyph grid aspect-square place-items-center rounded-md border">
                    <GlyphDiagram
                      edges={entry.edges}
                      label={`${entry.attributeLabel}: ${entry.value} key glyph`}
                      className="h-full w-full"
                      strokeWidth={5}
                    />
                  </span>
                  <span className="min-w-0">
                    <span className="flex min-w-0 flex-wrap items-center justify-between gap-2">
                      <span className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--text-faint)]">
                        {entry.attributeLabel}
                      </span>
                      <span className="hint-status-pill rounded-md border px-2 py-1 text-xs font-semibold">
                        {isApplied ? "Active" : isBlocked ? "Blocked" : "Apply"}
                      </span>
                    </span>
                    <span className="mt-1 block break-words font-semibold text-[var(--text-title)]">
                      {entry.value}
                    </span>
                    {entry.edges.length === 0 ? (
                      <span className="mt-1 flex items-center gap-1.5 text-xs text-[var(--text-muted)]">
                        <span
                          aria-hidden="true"
                          className="h-2.5 w-2.5 shrink-0 rounded-full"
                          style={{ backgroundColor: getHintLineColor(entry) }}
                        />
                        {formatDiscoveredKeyValue(entry)}
                      </span>
                    ) : null}
                  </span>
                </span>
              </button>
            );
          })
        ) : (
          <div className="cast-history-empty rounded-md border p-4 text-sm text-[var(--text-muted)]">
            Solve a spell to claim your first key.
          </div>
        )}
      </div>
    </section>
  );
}

function CastHistoryPanel({ history }: { history: readonly CastHistoryEntry[] }) {
  return (
    <section>
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--text-rune)]">Solved Spells</p>
          <h2 className="mt-1 font-display text-xl font-semibold text-[var(--text-title)]">Cast Log</h2>
        </div>
      </div>

      <div className="mt-4 grid max-h-none gap-3 lg:max-h-[calc(100vh-12rem)] lg:overflow-y-auto lg:pr-1">
        {history.length > 0 ? (
          history.map((entry, index) => (
            <details key={entry.id} className="cast-history-card group rounded-md border" open={index === 0}>
              <summary className="flex cursor-pointer list-none items-center gap-3 p-3 [&::-webkit-details-marker]:hidden">
                <span className="cast-history-glyph grid h-16 w-16 shrink-0 place-items-center rounded-md border">
                  <GlyphDiagram
                    edges={getRequiredEdgesForSpell(entry.spell)}
                    label={`${entry.spell.name} cast glyph`}
                    className="h-full w-full"
                    strokeWidth={5}
                  />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-display text-base font-semibold text-[var(--text-title)]">
                    {entry.spell.name}
                  </span>
                  <span className="mt-1 block text-xs text-[var(--text-muted)]">
                    {formatSpellLevel(entry.spell.level)} {entry.spell.school.toLowerCase()} ·{" "}
                    {formatCastTime(entry.castAt)}
                  </span>
                </span>
                <ChevronDown
                  aria-hidden="true"
                  className="shrink-0 text-[var(--text-muted)] transition group-open:rotate-180"
                  size={18}
                />
              </summary>

              <dl className="cast-history-details grid gap-2 border-t px-3 py-3 text-sm">
                {ATTRIBUTE_DEFINITIONS.map((attribute) => (
                  <div key={attribute.id} className="grid grid-cols-[6.75rem_1fr] gap-3">
                    <dt className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--text-faint)]">
                      {attribute.label}
                    </dt>
                    <dd className="min-w-0 text-[var(--text-body)]">
                      {formatAttributeValue(attribute.id, entry.spell[attribute.id])}
                    </dd>
                  </div>
                ))}
                <div className="pt-1">
                  <SpellDetailsLink spell={entry.spell} />
                </div>
              </dl>
            </details>
          ))
        ) : (
          <div className="cast-history-empty rounded-md border p-4 text-sm text-[var(--text-muted)]">
            Cast a complete glyph and it will appear here.
          </div>
        )}
      </div>
    </section>
  );
}

function PuzzleSidebar({
  history,
  discoveredKeys,
  canApplyKeys,
  canApplyDiscoveredKey,
  isAppliedDiscoveredKey,
  onApplyKey,
}: {
  history: readonly CastHistoryEntry[];
  discoveredKeys: readonly DiscoveredKeyEntry[];
  canApplyKeys: boolean;
  canApplyDiscoveredKey: (entry: DiscoveredKeyEntry) => boolean;
  isAppliedDiscoveredKey: (entry: DiscoveredKeyEntry) => boolean;
  onApplyKey: (entry: DiscoveredKeyEntry) => void;
}) {
  return (
    <aside className="cast-history-panel grid w-full gap-6 rounded-lg border p-4 shadow-glyph lg:sticky lg:top-8">
      <DiscoveredKeysPanel
        keys={discoveredKeys}
        canApply={canApplyKeys}
        canApplyKey={canApplyDiscoveredKey}
        isAppliedKey={isAppliedDiscoveredKey}
        onApplyKey={onApplyKey}
      />
      <CastHistoryPanel history={history} />
    </aside>
  );
}

function CasterPage() {
  const glyphBoardRef = useRef<HTMLDivElement | null>(null);
  const lastTimerWarningSecond = useRef<number | null>(null);
  const [drawnEdges, setDrawnEdges] = useState<Set<NormalizedEdge>>(() => new Set());
  const [isRevealingSpell, setIsRevealingSpell] = useState(false);
  const [revealRotationStepsByEdge, setRevealRotationStepsByEdge] = useState<Record<NormalizedEdge, number>>({});
  const [revealedSpellName, setRevealedSpellName] = useState<string | null>(null);
  const [castHistory, setCastHistory] = useState<CastHistoryEntry[]>([]);
  const [discoveredKeys, setDiscoveredKeys] = useState<DiscoveredKeyEntry[]>([]);
  const [appliedHintKeys, setAppliedHintKeys] = useState<DiscoveredKeyEntry[]>([]);
  const [pendingReward, setPendingReward] = useState<PendingSpellReward | null>(null);
  const [pendingKeyConflict, setPendingKeyConflict] = useState<PendingKeyConflict | null>(null);
  const [gameStatus, setGameStatus] = useState<GameStatus>("idle");
  const [remainingSeconds, setRemainingSeconds] = useState(GAME_DURATION_SECONDS);
  const [resumeCountdown, setResumeCountdown] = useState<number | null>(null);
  const solvedSpellNames = useMemo(() => new Set(castHistory.map((entry) => entry.spell.name)), [castHistory]);
  const requiredAttributeValues = useMemo(
    () => getRequiredAttributeValuesForAppliedKeys(appliedHintKeys),
    [appliedHintKeys],
  );
  const lockedAttributeSkips = useMemo(() => getLockedAttributeSkips(appliedHintKeys), [appliedHintKeys]);
  const matchedSpell = useMemo(
    () =>
      findExactSpellMatch(drawnEdges, {
        excludedSpellNames: solvedSpellNames,
        requiredAttributeValues,
      }),
    [drawnEdges, requiredAttributeValues, solvedSpellNames],
  );
  const possibleSpellCount = useMemo(
    () => countPossibleMatchingSpellsFromPartialDrawnEdges(drawnEdges, {
      excludedSpellNames: solvedSpellNames,
      requiredAttributeValues,
    }),
    [drawnEdges, requiredAttributeValues, solvedSpellNames],
  );
  const sortedDrawnEdges = useMemo(() => [...drawnEdges].sort(), [drawnEdges]);
  const canInteractWithBoard = gameStatus === "running" && !pendingReward && !pendingKeyConflict && remainingSeconds > 0;

  useEffect(() => {
    if (gameStatus !== "running") {
      lastTimerWarningSecond.current = null;
      return;
    }

    const timer = window.setInterval(() => {
      setRemainingSeconds((currentSeconds) => {
        if (currentSeconds <= 1) {
          setGameStatus("ended");
          setRevealRotationStepsByEdge({});
          setIsRevealingSpell(false);
          setPendingReward(null);
          setPendingKeyConflict(null);
          setAppliedHintKeys([]);
          setResumeCountdown(null);
          return 0;
        }

        return currentSeconds - 1;
      });
    }, 1000);

    return () => window.clearInterval(timer);
  }, [gameStatus]);

  useEffect(() => {
    if (gameStatus !== "running" || remainingSeconds > 10 || remainingSeconds <= 0) {
      lastTimerWarningSecond.current = null;
      return;
    }

    if (lastTimerWarningSecond.current === remainingSeconds) {
      return;
    }

    lastTimerWarningSecond.current = remainingSeconds;
    playTimerWarningSound(remainingSeconds);
  }, [gameStatus, remainingSeconds]);

  useEffect(() => {
    if (gameStatus !== "countdown" || resumeCountdown === null) {
      return;
    }

    if (resumeCountdown <= 0) {
      setResumeCountdown(null);
      setGameStatus(remainingSeconds > 0 ? "running" : "ended");
      return;
    }

    const timer = window.setTimeout(() => {
      setResumeCountdown((currentCountdown) => (currentCountdown === null ? null : currentCountdown - 1));
    }, 1000);

    return () => window.clearTimeout(timer);
  }, [gameStatus, remainingSeconds, resumeCountdown]);

  useEffect(() => {
    if (gameStatus !== "running" || !matchedSpell || revealedSpellName === matchedSpell.name || isRevealingSpell) {
      return;
    }

    const spellName = matchedSpell.name;
    const normalizedEdges = normalizeDrawnEdges(drawnEdges);
    const solvedSpellNamesAfterMatch = new Set([...solvedSpellNames, spellName]);
    const possibleCountAfterNormalize = countPossibleMatchingSpellsFromPartialDrawnEdges(normalizedEdges, {
      excludedSpellNames: solvedSpellNamesAfterMatch,
      requiredAttributeValues,
    });
    setRevealRotationStepsByEdge(getNormalizationRotationStepsByEdge(drawnEdges));
    setIsRevealingSpell(true);
    setGameStatus("paused");
    playSpellRevealSound();

    const lockTimer = window.setTimeout(() => {
      setDrawnEdges(new Set(normalizedEdges));
      setRevealedSpellName(spellName);
      setPendingReward({
        spell: matchedSpell,
        shouldResetAfterHint: possibleCountAfterNormalize === 0,
      });
    }, 1500);

    const finishTimer = window.setTimeout(() => {
      setIsRevealingSpell(false);
      setRevealRotationStepsByEdge({});
      setCastHistory((currentHistory) => [
        {
          id: Date.now(),
          spell: matchedSpell,
          castAt: new Date(),
        },
        ...currentHistory,
      ]);
    }, 2300);

    return () => {
      window.clearTimeout(lockTimer);
      window.clearTimeout(finishTimer);
    };
  }, [matchedSpell?.name]);

  function handleToggleEdge(edge: NormalizedEdge) {
    if (!canInteractWithBoard) {
      return;
    }

    if (lockedAttributeSkips.has(edgeToSkipStart(edge).skip)) {
      return;
    }

    primeRevealAudio();
    setRevealRotationStepsByEdge({});
    setRevealedSpellName(null);
    setDrawnEdges((currentEdges) => {
      const nextEdges = new Set(currentEdges);

      if (nextEdges.has(edge)) {
        nextEdges.delete(edge);
      } else {
        nextEdges.add(edge);
      }

      return nextEdges;
    });
  }

  function canToggleEdge(edge: NormalizedEdge): boolean {
    if (!canInteractWithBoard) {
      return false;
    }

    if (lockedAttributeSkips.has(edgeToSkipStart(edge).skip)) {
      return false;
    }

    if (drawnEdges.has(edge)) {
      return true;
    }

    return (
      countPossibleMatchingSpellsFromPartialDrawnEdges([...drawnEdges, edge], {
        excludedSpellNames: solvedSpellNames,
        requiredAttributeValues,
      }) > 0
    );
  }

  function handleReset() {
    primeRevealAudio();
    setRevealRotationStepsByEdge({});
    setIsRevealingSpell(false);
    setRevealedSpellName(null);
    setDrawnEdges(new Set());
    setAppliedHintKeys([]);
  }

  function resetPuzzleRound(nextStatus: GameStatus) {
    primeRevealAudio();
    setRevealRotationStepsByEdge({});
    setIsRevealingSpell(false);
    setRevealedSpellName(null);
    setPendingReward(null);
    setPendingKeyConflict(null);
    setDrawnEdges(new Set());
    setAppliedHintKeys([]);
    setCastHistory([]);
    setDiscoveredKeys([]);
    setRemainingSeconds(GAME_DURATION_SECONDS);
    setResumeCountdown(null);
    setGameStatus(nextStatus);
  }

  function handleStartRound() {
    resetPuzzleRound("running");
  }

  function handleResetRound() {
    resetPuzzleRound("idle");
  }

  function handleToggleRound() {
    if (pendingReward || pendingKeyConflict) {
      return;
    }

    if (gameStatus === "idle" || gameStatus === "ended") {
      handleStartRound();
      return;
    }

    if (gameStatus === "running" || gameStatus === "countdown") {
      setResumeCountdown(null);
      setGameStatus("paused");
      return;
    }

    if (gameStatus === "paused") {
      beginResumeCountdown();
    }
  }

  function beginResumeCountdown() {
    if (remainingSeconds <= 0) {
      setResumeCountdown(null);
      setGameStatus("ended");
      return;
    }

    window.setTimeout(() => {
      glyphBoardRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 0);
    setResumeCountdown(3);
    setGameStatus("countdown");
  }

  function resumeAfterReward(shouldResetBoard: boolean) {
    if (shouldResetBoard) {
      setDrawnEdges(new Set());
      setAppliedHintKeys([]);
      setRevealedSpellName(null);
    }

    setPendingReward(null);
    setRevealRotationStepsByEdge({});
    setIsRevealingSpell(false);
    beginResumeCountdown();
  }

  function handleChooseHint(attributeId: HintAttribute) {
    if (!pendingReward) {
      return;
    }

    const value = String(pendingReward.spell[attributeId]);
    const id = getDiscoveredKeyId(attributeId, value);
    const attributeLabel = getHintAttributeLabel(attributeId);
    const edges = getEdgesForSpellAttribute(pendingReward.spell, attributeId);

    setDiscoveredKeys((currentKeys) => {
      if (currentKeys.some((entry) => entry.id === id)) {
        return currentKeys;
      }

      return [
        {
          id,
          attributeId,
          attributeLabel,
          value,
          edges,
        },
        ...currentKeys,
      ];
    });
    resumeAfterReward(pendingReward.shouldResetAfterHint);
  }

  function handleContinueWithoutHint() {
    if (!pendingReward) {
      return;
    }

    resumeAfterReward(pendingReward.shouldResetAfterHint);
  }

  function getCanApplyDiscoveredKey(entry: DiscoveredKeyEntry): boolean {
    const proposedAppliedKeys = getAppliedKeysWithEntry(appliedHintKeys, entry);

    if (!proposedAppliedKeys) {
      return false;
    }

    const proposedEdges = applyHintKeyToEdges(drawnEdges, entry);
    const proposedRequiredAttributeValues = getRequiredAttributeValuesForAppliedKeys(proposedAppliedKeys);

    return (
      countPossibleMatchingSpellsFromPartialDrawnEdges(proposedEdges, {
        excludedSpellNames: solvedSpellNames,
        requiredAttributeValues: proposedRequiredAttributeValues,
      }) > 0
    );
  }

  function getIsAppliedDiscoveredKey(entry: DiscoveredKeyEntry): boolean {
    return appliedHintKeys.some((appliedKey) => appliedKey.id === entry.id);
  }

  function handleApplyDiscoveredKey(entry: DiscoveredKeyEntry) {
    if (!canInteractWithBoard) {
      return;
    }

    const proposedAppliedKeys = getAppliedKeysWithEntry(appliedHintKeys, entry);

    if (!proposedAppliedKeys) {
      return;
    }

    primeRevealAudio();
    setRevealRotationStepsByEdge({});
    setRevealedSpellName(null);
    const proposedEdges = applyHintKeyToEdges(drawnEdges, entry);
    const proposedRequiredAttributeValues = getRequiredAttributeValuesForAppliedKeys(proposedAppliedKeys);

    if (
      countPossibleMatchingSpellsFromPartialDrawnEdges(proposedEdges, {
        excludedSpellNames: solvedSpellNames,
        requiredAttributeValues: proposedRequiredAttributeValues,
      }) > 0
    ) {
      setDrawnEdges(new Set(proposedEdges));
      setAppliedHintKeys([...proposedAppliedKeys]);
      return;
    }

    setPendingKeyConflict({
      key: entry,
      proposedEdges,
      canOverride: countPossibleMatchingSpellsFromPartialDrawnEdges(entry.edges, {
        excludedSpellNames: solvedSpellNames,
        requiredAttributeValues: getRequiredAttributeValuesForAppliedKeys([entry]),
      }) > 0,
    });
    setGameStatus("paused");
  }

  function handleOverrideHintConflict() {
    if (!pendingKeyConflict || !pendingKeyConflict.canOverride) {
      return;
    }

    setDrawnEdges(new Set(pendingKeyConflict.key.edges));
    setAppliedHintKeys([pendingKeyConflict.key]);
    setRevealedSpellName(null);
    setPendingKeyConflict(null);
    beginResumeCountdown();
  }

  function handleKeepHintConflict() {
    setPendingKeyConflict(null);
    beginResumeCountdown();
  }

  function formatVisibleNodeEdge(edge: NormalizedEdge): string {
    const { a, b } = denormalizeEdge(edge);
    return `Nodes ${a + 1}-${b + 1}`;
  }

  function getEdgeAttribute(edge: NormalizedEdge) {
    const { skip } = edgeToSkipStart(edge);
    return ATTRIBUTE_DEFINITIONS.find((attribute) => attribute.skip === skip);
  }

  return (
    <section className="grid w-full gap-4 pb-36 lg:pb-0">
      <GameHud
        status={gameStatus}
        remainingSeconds={remainingSeconds}
        score={castHistory.length}
        canToggleRound={!pendingReward && !pendingKeyConflict}
        onToggleRound={handleToggleRound}
        onReset={handleResetRound}
      />

      <p className="w-full text-center text-sm text-[var(--text-muted)]">
        {possibleSpellCount} possible remaining {possibleSpellCount === 1 ? "spell" : "spells"}
      </p>

      <div
        className={[
          "grid w-full items-start gap-6",
          SHOW_DRAWN_EDGE_DEBUG
            ? "lg:grid-cols-[minmax(0,1fr)_22rem] xl:grid-cols-[minmax(0,1fr)_22rem_18rem]"
            : "lg:grid-cols-[minmax(0,1fr)_22rem]",
        ].join(" ")}
      >
        <div ref={glyphBoardRef} className="relative flex justify-center scroll-mt-6">
          <GlyphBoard
            drawnEdges={drawnEdges}
            canToggleEdge={canToggleEdge}
            isRevealing={isRevealingSpell}
            isRevealLocked={isRevealingSpell && Boolean(revealedSpellName)}
            isDisabled={!canInteractWithBoard}
            revealRotationStepsByEdge={revealRotationStepsByEdge}
            onToggleEdge={handleToggleEdge}
            onReset={handleReset}
          />
          {gameStatus === "countdown" && resumeCountdown !== null ? (
            <div
              className="resume-countdown-overlay absolute inset-0 z-10 grid place-items-center rounded-lg"
              aria-live="assertive"
            >
              <div
                key={resumeCountdown}
                className="resume-countdown-number font-display font-semibold text-[var(--text-title)]"
              >
                {resumeCountdown > 0 ? resumeCountdown : "Go"}
              </div>
            </div>
          ) : null}
        </div>

        <PuzzleSidebar
          history={castHistory}
          discoveredKeys={discoveredKeys}
          canApplyKeys={canInteractWithBoard}
          canApplyDiscoveredKey={getCanApplyDiscoveredKey}
          isAppliedDiscoveredKey={getIsAppliedDiscoveredKey}
          onApplyKey={handleApplyDiscoveredKey}
        />

        {SHOW_DRAWN_EDGE_DEBUG ? (
          <aside className="debug-panel rounded-lg border p-4 shadow-glyph">
            <h2 className="font-display text-lg font-semibold text-[var(--text-title)]">Drawn Edges</h2>
            <div className="debug-panel-inner mt-3 min-h-32 rounded-md border p-3">
              {sortedDrawnEdges.length > 0 ? (
                <ol className="grid gap-2 text-sm text-[var(--text-body)]">
                  {sortedDrawnEdges.map((edge) => {
                    const { skip } = edgeToSkipStart(edge);
                    const attribute = getEdgeAttribute(edge);

                    return (
                      <li key={edge} className="debug-edge-item rounded border px-2 py-1.5">
                        <span className="flex items-center gap-2 font-semibold text-[var(--text-title)]">
                          <span
                            aria-hidden="true"
                            className="h-2.5 w-2.5 rounded-full"
                            style={{ backgroundColor: ATTRIBUTE_ACCENTS[skip] }}
                          />
                          {formatVisibleNodeEdge(edge)}
                        </span>
                        <span className="block text-xs text-[var(--text-muted)]">
                          {attribute?.label ?? "Unknown attribute"}
                        </span>
                        <span className="block font-mono text-xs text-[var(--text-faint)]">debug {edge}</span>
                      </li>
                    );
                  })}
                </ol>
              ) : (
                <p className="text-sm text-[var(--text-faint)]">No lines drawn.</p>
              )}
            </div>
          </aside>
        ) : null}
      </div>

      {pendingReward && !isRevealingSpell ? (
        <div
          className="pause-modal-backdrop fixed inset-0 z-40 grid place-items-center overflow-y-auto p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="pause-modal-title"
        >
          <SpellRewardPanel
            reward={pendingReward}
            discoveredKeys={discoveredKeys}
            onChooseHint={handleChooseHint}
            onContinue={handleContinueWithoutHint}
          />
        </div>
      ) : null}

      {pendingKeyConflict ? (
        <div
          className="pause-modal-backdrop fixed inset-0 z-40 grid place-items-center overflow-y-auto p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="key-conflict-title"
        >
          <KeyConflictPanel
            conflict={pendingKeyConflict}
            onOverride={handleOverrideHintConflict}
            onKeep={handleKeepHintConflict}
          />
        </div>
      ) : null}
    </section>
  );
}

function App() {
  const routeId = useRouteId();

  return (
    <main className="app-shell min-h-screen">
      <div className="app-backdrop absolute inset-0" />
      <div className="relative mx-auto flex min-h-screen w-full max-w-7xl flex-col items-center gap-8 px-4 py-8 sm:px-6 lg:px-8">
        <PrimaryNavigation currentRoute={routeId} />
        {routeId === "gallery" ? <SpellGalleryPage /> : routeId === "keys" ? <AttributeKeysPage /> : <CasterPage />}
      </div>
    </main>
  );
}

export default App;
