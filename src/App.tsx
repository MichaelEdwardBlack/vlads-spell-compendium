import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { CSSProperties, MouseEvent } from "react";
import { Award, BookOpen, ChevronDown, Grid3X3, Pause, Play, RotateCcw, Sparkles, Wand2 } from "lucide-react";
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
import { SPELLS } from "./data/spells";
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
const COLLECTOR_CAST_HISTORY_STORAGE_KEY = "vlads-spell-compendium.collectorCastHistory.v1";
const KEY_UNLOCK_DISCOVERY_RATIO = 0.3;
const COLLECTOR_CONFETTI_PIECES = Array.from({ length: 34 }, (_, index) => index);

type RouteId = "puzzle" | "cast" | "gallery" | "keys";
type GameStatus = "idle" | "running" | "paused" | "countdown" | "ended";
type HintAttribute = Exclude<SpellAttribute, "level">;
type CastHistorySortMode = "time" | "level";
type CollectorKeySortMode = "time" | "percent";

type CastHistoryEntry = {
  id: number;
  spell: Spell;
  castAt: Date;
};

type DiscoveredKeyEntry = {
  id: string;
  attributeId: SpellAttribute;
  attributeLabel: string;
  value: string;
  edges: NormalizedEdge[];
  collectedCount?: number;
  totalCount?: number;
  unlockedAt?: number;
  isNewlyUnlocked?: boolean;
  isComplete?: boolean;
  isNewlyComplete?: boolean;
};

type CollectorKeyCelebration = {
  kind: "unlock" | "mastery";
  key: DiscoveredKeyEntry;
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
  { id: "cast", path: "/", label: "Cast", Icon: Sparkles },
  { id: "puzzle", path: "/puzzle", label: "Puzzle", Icon: Wand2 },
  { id: "gallery", path: "/gallery", label: "Gallery", Icon: Grid3X3 },
  { id: "keys", path: "/keys", label: "Keys", Icon: BookOpen },
];

const HINT_ATTRIBUTE_DEFINITIONS = ATTRIBUTE_DEFINITIONS.filter(
  (attribute): attribute is (typeof ATTRIBUTE_DEFINITIONS)[number] & { id: HintAttribute } => attribute.id !== "level",
);

function getRouteId(pathname: string): RouteId {
  if (pathname === "/puzzle") {
    return "puzzle";
  }

  if (pathname === "/gallery") {
    return "gallery";
  }

  if (pathname === "/keys") {
    return "keys";
  }

  return "cast";
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
    <nav className="site-nav rounded-lg border px-1.5 py-1.5 shadow-glyph sm:px-2 sm:py-2" aria-label="Primary navigation">
      <div className="flex flex-nowrap items-center justify-center gap-1 sm:gap-2">
        {ROUTES.map(({ id, path, label, Icon }) => (
          <a
            key={id}
            href={path}
            onClick={(event) => handleNavigate(event, path)}
            aria-current={currentRoute === id ? "page" : undefined}
            className={[
              "site-nav-link inline-flex min-w-0 flex-1 items-center justify-center gap-1 rounded-md border px-1.5 py-2 text-xs font-semibold transition sm:flex-none sm:gap-2 sm:px-3 sm:text-sm",
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

function loadCollectorCastHistory(): CastHistoryEntry[] {
  try {
    const storedValue = window.localStorage.getItem(COLLECTOR_CAST_HISTORY_STORAGE_KEY);

    if (!storedValue) {
      return [];
    }

    const parsedValue = JSON.parse(storedValue) as { spellName: string; castAt: string }[];
    const seenSpellNames = new Set<string>();

    return parsedValue.flatMap((entry, index) => {
      if (seenSpellNames.has(entry.spellName)) {
        return [];
      }

      const spell = SPELLS.find((candidate) => candidate.name === entry.spellName);
      const castAt = new Date(entry.castAt);

      if (!spell || Number.isNaN(castAt.getTime())) {
        return [];
      }

      seenSpellNames.add(entry.spellName);

      return [
        {
          id: castAt.getTime() + index,
          spell,
          castAt,
        },
      ];
    });
  } catch {
    return [];
  }
}

function saveCollectorCastHistory(history: readonly CastHistoryEntry[]) {
  try {
    window.localStorage.setItem(
      COLLECTOR_CAST_HISTORY_STORAGE_KEY,
      JSON.stringify(history.map((entry) => ({ spellName: entry.spell.name, castAt: entry.castAt.toISOString() }))),
    );
  } catch {
    // Persistence is best-effort; casting should keep working if storage is unavailable.
  }
}

function formatRemainingTime(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function getSpellKeyAttributeLabel(attributeId: SpellAttribute): string {
  return attributeId === "school"
    ? "School of Magic"
    : (ATTRIBUTE_DEFINITIONS.find((attribute) => attribute.id === attributeId)?.label ?? attributeId);
}

function getSpellKeyAttributeDefinition(attributeId: SpellAttribute) {
  return ATTRIBUTE_DEFINITIONS.find((definition) => definition.id === attributeId);
}

function getHintAttributeDefinition(attributeId: HintAttribute) {
  return getSpellKeyAttributeDefinition(attributeId);
}

function getKeyLineColorName(attributeId: SpellAttribute): string {
  const skip = getSpellKeyAttributeDefinition(attributeId)?.skip;

  return skip === undefined ? "matching" : ATTRIBUTE_LINE_COLOR_NAMES[skip];
}

function formatDiscoveredKeyValue(entry: DiscoveredKeyEntry): string {
  return entry.edges.length === 0 ? `No ${getKeyLineColorName(entry.attributeId)} lines` : entry.value;
}

function formatKeyEntryValue(entry: DiscoveredKeyEntry): string {
  return entry.attributeId === "level" ? formatSpellLevel(Number(entry.value) as Spell["level"]) : entry.value;
}

function getHintLineColor(entry: DiscoveredKeyEntry): string {
  const skip = getSpellKeyAttributeDefinition(entry.attributeId)?.skip;

  return skip === undefined ? "var(--border-strong)" : ATTRIBUTE_ACCENTS[skip];
}

function getEdgesForSpellAttributeValue(attributeId: SpellAttribute, value: string): NormalizedEdge[] {
  const attribute = getSpellKeyAttributeDefinition(attributeId);

  if (!attribute) {
    return [];
  }

  const bitstring = attribute.keys[value];

  return uniqueNormalizedEdges(bitstringToEdges(bitstring, attribute.skip));
}

function getEdgesForSpellAttribute(spell: Spell, attributeId: SpellAttribute): NormalizedEdge[] {
  return getEdgesForSpellAttributeValue(attributeId, String(spell[attributeId]));
}

function getDiscoveredKeyId(attributeId: SpellAttribute, value: string): string {
  return `${attributeId}:${value}`;
}

function getCollectorKeyCelebrationId(celebration: CollectorKeyCelebration): string {
  return `${celebration.kind}:${celebration.key.id}`;
}

function mergeCollectorKeyCelebrations(
  currentCelebrations: readonly CollectorKeyCelebration[],
  nextCelebrations: readonly CollectorKeyCelebration[],
): CollectorKeyCelebration[] {
  const seenCelebrationIds = new Set(currentCelebrations.map(getCollectorKeyCelebrationId));
  const uniqueNextCelebrations = nextCelebrations.filter((celebration) => {
    const celebrationId = getCollectorKeyCelebrationId(celebration);

    if (seenCelebrationIds.has(celebrationId)) {
      return false;
    }

    seenCelebrationIds.add(celebrationId);
    return true;
  });

  return uniqueNextCelebrations.length > 0
    ? [...currentCelebrations, ...uniqueNextCelebrations]
    : [...currentCelebrations];
}

function applyHintKeyToEdges(
  currentEdges: Iterable<NormalizedEdge>,
  entry: DiscoveredKeyEntry,
): NormalizedEdge[] {
  const attribute = getSpellKeyAttributeDefinition(entry.attributeId);

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
      const attribute = getSpellKeyAttributeDefinition(entry.attributeId);
      return attribute ? [attribute.skip] : [];
    }),
  );
}

function getUnlockedCollectorKeys(
  castHistory: readonly CastHistoryEntry[],
  newlyUnlockedKeyIds: ReadonlySet<string>,
  newlyCompletedKeyIds: ReadonlySet<string>,
): DiscoveredKeyEntry[] {
  const collectedSpellNames = new Set(castHistory.map((entry) => entry.spell.name));
  const chronologicalHistory = [...castHistory].sort((left, right) => left.castAt.getTime() - right.castAt.getTime());

  return ATTRIBUTE_DEFINITIONS.flatMap((attribute) =>
    attribute.values.flatMap((value) => {
      const stringValue = String(value);
      const matchingSpells = SPELLS.filter((spell) => String(spell[attribute.id]) === stringValue);
      const requiredCount = Math.ceil(matchingSpells.length * KEY_UNLOCK_DISCOVERY_RATIO);
      const collectedCount = matchingSpells.filter((spell) => collectedSpellNames.has(spell.name)).length;
      const id = getDiscoveredKeyId(attribute.id, stringValue);
      const matchingSpellNames = new Set(matchingSpells.map((spell) => spell.name));
      let runningCollectedCount = 0;
      let unlockedAt: number | undefined;

      if (matchingSpells.length === 0 || collectedCount < requiredCount) {
        return [];
      }

      for (const entry of chronologicalHistory) {
        if (!matchingSpellNames.has(entry.spell.name)) {
          continue;
        }

        runningCollectedCount += 1;

        if (runningCollectedCount >= requiredCount) {
          unlockedAt = entry.castAt.getTime();
          break;
        }
      }

      return [
        {
          id,
          attributeId: attribute.id,
          attributeLabel: getSpellKeyAttributeLabel(attribute.id),
          value: stringValue,
          edges: getEdgesForSpellAttributeValue(attribute.id, stringValue),
          collectedCount,
          totalCount: matchingSpells.length,
          unlockedAt,
          isNewlyUnlocked: newlyUnlockedKeyIds.has(id),
          isComplete: collectedCount === matchingSpells.length,
          isNewlyComplete: newlyCompletedKeyIds.has(id),
        },
      ];
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
                {getSpellKeyAttributeLabel(attribute.id)}
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

function CollectorKeyCelebrationDialog({
  celebration,
  remainingCount,
  onContinue,
}: {
  celebration: CollectorKeyCelebration;
  remainingCount: number;
  onContinue: () => void;
}) {
  const isMastery = celebration.kind === "mastery";
  const celebrationTone = isMastery ? "mastery" : "unlock";
  const Icon = isMastery ? Award : Sparkles;

  return (
    <>
      <div className={`collector-confetti collector-confetti-${celebrationTone}`} aria-hidden="true">
        {COLLECTOR_CONFETTI_PIECES.map((pieceIndex) => (
          <span
            key={pieceIndex}
            className="collector-confetti-piece"
            style={
              {
                "--confetti-x": `${8 + ((pieceIndex * 29) % 84)}%`,
                "--confetti-drift": `${((pieceIndex % 7) - 3) * 2.2}rem`,
                "--confetti-drift-end": `${((pieceIndex % 7) - 3) * 3.1}rem`,
                "--confetti-peak": `-${36 + (pieceIndex % 6) * 5}vh`,
                "--confetti-delay": `${(pieceIndex % 11) * 32}ms`,
                "--confetti-duration": `${1280 + (pieceIndex % 8) * 95}ms`,
                "--confetti-rotate": `${pieceIndex * 37}deg`,
              } as CSSProperties
            }
          />
        ))}
      </div>
      <section
        className={[
          "collector-key-dialog w-full max-w-md rounded-lg border p-5 text-center shadow-glyph",
          `collector-key-dialog-${celebrationTone}`,
        ].join(" ")}
      >
        <div className="collector-key-dialog-shine" aria-hidden="true" />
        <div className="mx-auto grid h-20 w-20 place-items-center rounded-full border collector-key-dialog-emblem">
          <Icon aria-hidden="true" size={36} />
        </div>
        <p className="collector-key-dialog-eyebrow mt-5 text-xs font-semibold uppercase tracking-[0.22em]">
          {isMastery ? "Key Mastered" : "Key Unlocked"}
        </p>
        <h2
          id="collector-key-dialog-title"
          className="spell-result-title mt-2 font-display text-4xl font-semibold text-[var(--text-title)]"
        >
          {formatKeyEntryValue(celebration.key)}
        </h2>
        <p className="mt-1 text-sm font-semibold text-[var(--text-body)]">{celebration.key.attributeLabel}</p>
        <p className="mt-3 text-sm text-[var(--text-muted)]">
          {isMastery
            ? `100% collected. Every ${formatKeyEntryValue(celebration.key)} spell is now in your collection.`
            : `${celebration.key.collectedCount}/${celebration.key.totalCount} collected. This key can now help narrow future casts.`}
        </p>
        <button
          type="button"
          onClick={onContinue}
          className="hint-choice-button mt-5 rounded-md border px-4 py-2 text-sm font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4"
        >
          {remainingCount > 0 ? "Next" : "Continue"}
        </button>
      </section>
    </>
  );
}

function DiscoveredKeysPanel({
  keys,
  canApply,
  canApplyKey,
  isAppliedKey,
  onApplyKey,
  eyebrow = "Discovered Keys",
  title = "Hint Glyphs",
  emptyText = "Solve a spell to claim your first key.",
  sortMode,
  onSortModeChange,
  isCollapsible = false,
}: {
  keys: readonly DiscoveredKeyEntry[];
  canApply: boolean;
  canApplyKey: (entry: DiscoveredKeyEntry) => boolean;
  isAppliedKey: (entry: DiscoveredKeyEntry) => boolean;
  onApplyKey: (entry: DiscoveredKeyEntry) => void;
  eyebrow?: string;
  title?: string;
  emptyText?: string;
  sortMode?: CollectorKeySortMode;
  onSortModeChange?: (mode: CollectorKeySortMode) => void;
  isCollapsible?: boolean;
}) {
  const contentId = useId();
  const [isExpanded, setIsExpanded] = useState(true);
  const visibleKeys = useMemo(() => {
    if (!sortMode) {
      return keys;
    }

    return [...keys].sort((left, right) => {
      if (sortMode === "percent") {
        if (Boolean(left.isComplete) !== Boolean(right.isComplete)) {
          return left.isComplete ? 1 : -1;
        }

        const leftProgress = (left.collectedCount ?? 0) / (left.totalCount ?? 1);
        const rightProgress = (right.collectedCount ?? 0) / (right.totalCount ?? 1);

        if (leftProgress !== rightProgress) {
          return rightProgress - leftProgress;
        }
      }

      const timeDifference = (right.unlockedAt ?? 0) - (left.unlockedAt ?? 0);

      if (timeDifference !== 0) {
        return timeDifference;
      }

      const attributeDifference = left.attributeLabel.localeCompare(right.attributeLabel);

      if (attributeDifference !== 0) {
        return attributeDifference;
      }

      return formatKeyEntryValue(left).localeCompare(formatKeyEntryValue(right));
    });
  }, [keys, sortMode]);

  return (
    <section>
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--text-rune)]">{eyebrow}</p>
          <h2 className="mt-1 font-display text-xl font-semibold text-[var(--text-title)]">{title}</h2>
        </div>
        {isCollapsible ? (
          <button
            type="button"
            onClick={() => setIsExpanded((currentValue) => !currentValue)}
            aria-expanded={isExpanded}
            aria-controls={contentId}
            className="arcane-icon-button shrink-0 rounded-md border p-2 transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            <ChevronDown
              aria-hidden="true"
              className={["transition", isExpanded ? "rotate-180" : ""].join(" ")}
              size={18}
            />
            <span className="sr-only">{isExpanded ? `Collapse ${title}` : `Expand ${title}`}</span>
          </button>
        ) : null}
      </div>

      <div id={contentId} className={["mt-4 grid gap-3", isCollapsible && !isExpanded ? "hidden" : ""].join(" ")}>
        {sortMode && onSortModeChange ? (
          <div className="cast-history-sort justify-self-start rounded-md border p-1" aria-label="Sort collector keys">
            {[
              { id: "time" as const, label: "Time" },
              { id: "percent" as const, label: "Progress" },
            ].map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => onSortModeChange(option.id)}
                className={[
                  "rounded px-2.5 py-1.5 text-xs font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2",
                  sortMode === option.id ? "cast-history-sort-active" : "text-[var(--text-muted)]",
                ].join(" ")}
              >
                {option.label}
              </button>
            ))}
          </div>
        ) : null}
        {visibleKeys.length > 0 ? (
          visibleKeys.map((entry) => {
            const isApplied = isAppliedKey(entry);
            const isComplete = Boolean(entry.isComplete);
            const isNewlyComplete = Boolean(entry.isNewlyComplete);
            const isBlocked = !isComplete && !canApplyKey(entry);
            const progressText =
              entry.collectedCount !== undefined && entry.totalCount !== undefined
                ? isComplete
                  ? "100% collected"
                  : `${entry.collectedCount}/${entry.totalCount} collected`
                : null;

            return (
              <button
                key={entry.id}
                type="button"
                onClick={() => onApplyKey(entry)}
                disabled={!canApply || isApplied || isBlocked || isComplete}
                className={[
                  "discovered-key-button rounded-md border p-3 text-left transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 disabled:cursor-not-allowed",
                  isComplete ? "discovered-key-complete" : "disabled:opacity-55",
                  entry.isNewlyUnlocked && !isComplete ? "discovered-key-unlocked-new" : "",
                  isNewlyComplete ? "discovered-key-complete-new" : "",
                ].join(" ")}
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
                      <span
                        className={[
                          "hint-status-pill rounded-md border px-2 py-1 text-xs font-semibold",
                          entry.isNewlyUnlocked && !isComplete ? "hint-status-pill-unlocked" : "",
                          isComplete ? "hint-status-pill-complete inline-flex items-center gap-1" : "",
                        ].join(" ")}
                      >
                        {isComplete ? <Award aria-hidden="true" size={isNewlyComplete ? 15 : 13} /> : null}
                        {isComplete
                          ? isNewlyComplete
                            ? "Mastered!"
                            : "Mastered"
                          : entry.isNewlyUnlocked
                            ? "Unlocked"
                            : isApplied
                              ? "Active"
                              : isBlocked
                                ? "Blocked"
                                : "Apply"}
                      </span>
                    </span>
                    <span className="mt-1 block break-words font-semibold text-[var(--text-title)]">
                      {formatKeyEntryValue(entry)}
                    </span>
                    {progressText ? (
                      <span className="mt-1 block text-xs font-semibold text-[var(--text-muted)]">
                        {progressText}
                      </span>
                    ) : null}
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
            {emptyText}
          </div>
        )}
      </div>
    </section>
  );
}

function CastHistoryPanel({
  history,
  eyebrow = "Solved Spells",
  title = "Cast Log",
  emptyText = "Cast a complete glyph and it will appear here.",
  sortMode,
  onSortModeChange,
  isCollapsible = false,
}: {
  history: readonly CastHistoryEntry[];
  eyebrow?: string;
  title?: string;
  emptyText?: string;
  sortMode?: CastHistorySortMode;
  onSortModeChange?: (mode: CastHistorySortMode) => void;
  isCollapsible?: boolean;
}) {
  const contentId = useId();
  const [isExpanded, setIsExpanded] = useState(true);
  const visibleHistory = useMemo(() => {
    if (sortMode !== "level") {
      return history;
    }

    return [...history].sort((left, right) => {
      if (left.spell.level !== right.spell.level) {
        return left.spell.level - right.spell.level;
      }

      return left.spell.name.localeCompare(right.spell.name);
    });
  }, [history, sortMode]);

  return (
    <section>
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--text-rune)]">{eyebrow}</p>
          <h2 className="mt-1 font-display text-xl font-semibold text-[var(--text-title)]">{title}</h2>
        </div>
        {isCollapsible ? (
          <button
            type="button"
            onClick={() => setIsExpanded((currentValue) => !currentValue)}
            aria-expanded={isExpanded}
            aria-controls={contentId}
            className="arcane-icon-button shrink-0 rounded-md border p-2 transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            <ChevronDown
              aria-hidden="true"
              className={["transition", isExpanded ? "rotate-180" : ""].join(" ")}
              size={18}
            />
            <span className="sr-only">{isExpanded ? `Collapse ${title}` : `Expand ${title}`}</span>
          </button>
        ) : null}
      </div>

      <div
        id={contentId}
        className={[
          "mt-4 grid max-h-none gap-3 lg:max-h-[calc(100vh-12rem)] lg:overflow-y-auto lg:pr-1",
          isCollapsible && !isExpanded ? "hidden" : "",
        ].join(" ")}
      >
        {sortMode && onSortModeChange ? (
          <div className="cast-history-sort justify-self-start rounded-md border p-1" aria-label="Sort collected spells">
            {[
              { id: "time" as const, label: "Time" },
              { id: "level" as const, label: "Level A-Z" },
            ].map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => onSortModeChange(option.id)}
                className={[
                  "rounded px-2.5 py-1.5 text-xs font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2",
                  sortMode === option.id ? "cast-history-sort-active" : "text-[var(--text-muted)]",
                ].join(" ")}
              >
                {option.label}
              </button>
            ))}
          </div>
        ) : null}
        {visibleHistory.length > 0 ? (
          visibleHistory.map((entry, index) => (
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
                  <span className="block min-w-0 break-words font-display text-base font-semibold text-[var(--text-title)]">
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
            {emptyText}
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

function PuzzlePage() {
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
    const attributeLabel = getSpellKeyAttributeLabel(attributeId);
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

function CastPage() {
  const [drawnEdges, setDrawnEdges] = useState<Set<NormalizedEdge>>(() => new Set());
  const [isRevealingSpell, setIsRevealingSpell] = useState(false);
  const [revealRotationStepsByEdge, setRevealRotationStepsByEdge] = useState<Record<NormalizedEdge, number>>({});
  const [revealedSpellName, setRevealedSpellName] = useState<string | null>(null);
  const [lastCastSpell, setLastCastSpell] = useState<Spell | null>(null);
  const [castHistory, setCastHistory] = useState<CastHistoryEntry[]>(loadCollectorCastHistory);
  const [newlyUnlockedKeyIds, setNewlyUnlockedKeyIds] = useState<Set<string>>(() => new Set());
  const [newlyCompletedKeyIds, setNewlyCompletedKeyIds] = useState<Set<string>>(() => new Set());
  const [collectorKeyCelebrations, setCollectorKeyCelebrations] = useState<CollectorKeyCelebration[]>([]);
  const [appliedCollectorKeys, setAppliedCollectorKeys] = useState<DiscoveredKeyEntry[]>([]);
  const [castHistorySortMode, setCastHistorySortMode] = useState<CastHistorySortMode>("time");
  const [collectorKeySortMode, setCollectorKeySortMode] = useState<CollectorKeySortMode>("time");
  const collectedSpellNames = useMemo(() => new Set(castHistory.map((entry) => entry.spell.name)), [castHistory]);
  const unlockedCollectorKeys = useMemo(
    () => getUnlockedCollectorKeys(castHistory, newlyUnlockedKeyIds, newlyCompletedKeyIds),
    [castHistory, newlyCompletedKeyIds, newlyUnlockedKeyIds],
  );
  const unlockedCollectorKeyIds = useMemo(
    () => new Set(unlockedCollectorKeys.map((entry) => entry.id)),
    [unlockedCollectorKeys],
  );
  const completedCollectorKeyIds = useMemo(
    () => new Set(unlockedCollectorKeys.filter((entry) => entry.isComplete).map((entry) => entry.id)),
    [unlockedCollectorKeys],
  );
  const requiredAttributeValues = useMemo(
    () => getRequiredAttributeValuesForAppliedKeys(appliedCollectorKeys),
    [appliedCollectorKeys],
  );
  const lockedAttributeSkips = useMemo(() => getLockedAttributeSkips(appliedCollectorKeys), [appliedCollectorKeys]);
  const matchedSpell = useMemo(
    () =>
      findExactSpellMatch(drawnEdges, {
        excludedSpellNames: collectedSpellNames,
        requiredAttributeValues,
      }),
    [collectedSpellNames, drawnEdges, requiredAttributeValues],
  );
  const possibleSpellCount = useMemo(
    () =>
      countPossibleMatchingSpellsFromPartialDrawnEdges(drawnEdges, {
        excludedSpellNames: collectedSpellNames,
        requiredAttributeValues,
      }),
    [collectedSpellNames, drawnEdges, requiredAttributeValues],
  );
  const collectionTotal = SPELLS.length;
  const canInteractWithBoard =
    !isRevealingSpell && collectorKeyCelebrations.length === 0 && castHistory.length < collectionTotal;

  useEffect(() => {
    saveCollectorCastHistory(castHistory);
  }, [castHistory]);

  useEffect(() => {
    if (newlyUnlockedKeyIds.size === 0 && newlyCompletedKeyIds.size === 0) {
      return;
    }

    const timer = window.setTimeout(() => {
      setNewlyUnlockedKeyIds(new Set());
      setNewlyCompletedKeyIds(new Set());
    }, 2400);

    return () => window.clearTimeout(timer);
  }, [newlyCompletedKeyIds, newlyUnlockedKeyIds]);

  useEffect(() => {
    if (!matchedSpell || revealedSpellName === matchedSpell.name || isRevealingSpell) {
      return;
    }

    const spellName = matchedSpell.name;
    const normalizedEdges = normalizeDrawnEdges(drawnEdges);

    setRevealRotationStepsByEdge(getNormalizationRotationStepsByEdge(drawnEdges));
    setIsRevealingSpell(true);
    playSpellRevealSound();

    const lockTimer = window.setTimeout(() => {
      setDrawnEdges(new Set(normalizedEdges));
      setRevealedSpellName(spellName);
    }, 1500);

    const finishTimer = window.setTimeout(() => {
      setIsRevealingSpell(false);
      setRevealRotationStepsByEdge({});
      setRevealedSpellName(null);
      setLastCastSpell(matchedSpell);
      setDrawnEdges(new Set());
      setAppliedCollectorKeys([]);

      if (castHistory.some((entry) => entry.spell.name === matchedSpell.name)) {
        return;
      }

      const nextHistory = [
        {
          id: Date.now(),
          spell: matchedSpell,
          castAt: new Date(),
        },
        ...castHistory,
      ];
      const nextUnlockedKeys = getUnlockedCollectorKeys(nextHistory, new Set(), new Set());
      const nextUnlockedKeyIds = new Set(nextUnlockedKeys.map((entry) => entry.id));
      const nextCompletedKeyIds = new Set(nextUnlockedKeys.filter((entry) => entry.isComplete).map((entry) => entry.id));
      const newlyUnlockedIds = [...nextUnlockedKeyIds].filter((id) => !unlockedCollectorKeyIds.has(id));
      const newlyCompletedIds = [...nextCompletedKeyIds].filter((id) => !completedCollectorKeyIds.has(id));
      const newlyUnlockedOnlyIds = newlyUnlockedIds.filter((id) => !newlyCompletedIds.includes(id));

      if (newlyUnlockedOnlyIds.length > 0) {
        setNewlyUnlockedKeyIds(new Set(newlyUnlockedOnlyIds));
      }

      if (newlyCompletedIds.length > 0) {
        setNewlyCompletedKeyIds(new Set(newlyCompletedIds));
      }

      const nextKeyById = new Map(nextUnlockedKeys.map((entry) => [entry.id, entry]));
      const nextCelebrations = [
        ...newlyCompletedIds.flatMap((id) => {
          const key = nextKeyById.get(id);
          return key ? [{ kind: "mastery" as const, key }] : [];
        }),
        ...newlyUnlockedOnlyIds.flatMap((id) => {
          const key = nextKeyById.get(id);
          return key ? [{ kind: "unlock" as const, key }] : [];
        }),
      ];

      if (nextCelebrations.length > 0) {
        setCollectorKeyCelebrations((currentCelebrations) =>
          mergeCollectorKeyCelebrations(currentCelebrations, nextCelebrations),
        );
      }

      setCastHistory(nextHistory);
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
    setLastCastSpell(null);
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
        excludedSpellNames: collectedSpellNames,
        requiredAttributeValues,
      }) > 0
    );
  }

  function getCanApplyCollectorKey(entry: DiscoveredKeyEntry): boolean {
    const proposedAppliedKeys = getAppliedKeysWithEntry(appliedCollectorKeys, entry);

    if (!proposedAppliedKeys) {
      return false;
    }

    const proposedEdges = applyHintKeyToEdges(drawnEdges, entry);
    const proposedRequiredAttributeValues = getRequiredAttributeValuesForAppliedKeys(proposedAppliedKeys);

    return (
      countPossibleMatchingSpellsFromPartialDrawnEdges(proposedEdges, {
        excludedSpellNames: collectedSpellNames,
        requiredAttributeValues: proposedRequiredAttributeValues,
      }) > 0
    );
  }

  function getIsAppliedCollectorKey(entry: DiscoveredKeyEntry): boolean {
    return appliedCollectorKeys.some((appliedKey) => appliedKey.id === entry.id);
  }

  function handleApplyCollectorKey(entry: DiscoveredKeyEntry) {
    if (!canInteractWithBoard) {
      return;
    }

    const proposedAppliedKeys = getAppliedKeysWithEntry(appliedCollectorKeys, entry);

    if (!proposedAppliedKeys) {
      return;
    }

    const proposedEdges = applyHintKeyToEdges(drawnEdges, entry);

    if (!getCanApplyCollectorKey(entry)) {
      return;
    }

    primeRevealAudio();
    setRevealRotationStepsByEdge({});
    setRevealedSpellName(null);
    setLastCastSpell(null);
    setDrawnEdges(new Set(proposedEdges));
    setAppliedCollectorKeys([...proposedAppliedKeys]);
  }

  function handleReset() {
    primeRevealAudio();
    setRevealRotationStepsByEdge({});
    setIsRevealingSpell(false);
    setRevealedSpellName(null);
    setLastCastSpell(null);
    setDrawnEdges(new Set());
    setAppliedCollectorKeys([]);
  }

  function handleContinueCollectorKeyCelebration() {
    setCollectorKeyCelebrations((currentCelebrations) => currentCelebrations.slice(1));
  }

  return (
    <section className="grid w-full gap-6">
      <header className="mx-auto max-w-3xl text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--text-rune)]">Collector Mode</p>
        <h1 className="mt-3 font-display text-4xl font-semibold text-[var(--text-title)] sm:text-5xl">Cast</h1>
        <p className="mt-3 text-sm text-[var(--text-muted)]">
          Cast each spell once and build a persistent collection on this device.
        </p>
      </header>

      <section className="collector-panel mx-auto w-full max-w-xs rounded-lg border p-3 text-center shadow-glyph">
        <div className="game-stat rounded-md border px-3 py-2">
          <span className="block text-xs font-semibold uppercase tracking-[0.16em] text-[var(--text-faint)]">
            Collected
          </span>
          <span className="mt-1 block font-display text-xl font-semibold text-[var(--text-title)] sm:text-2xl">
            {castHistory.length}/{collectionTotal}
          </span>
        </div>
      </section>

      <section className="collector-panel mx-auto w-full max-w-4xl rounded-lg border p-5 text-center shadow-glyph">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--text-rune)]">Casting Result</p>
        <h2
          key={lastCastSpell?.name ?? (isRevealingSpell ? "revealing" : "ready")}
          className={[
            "spell-result-title mx-auto mt-3 max-w-full font-display text-3xl font-semibold text-[var(--text-title)] sm:text-4xl",
            lastCastSpell ? "spell-name-reveal" : "",
            isRevealingSpell && !lastCastSpell ? "spell-name-charging" : "",
          ].join(" ")}
        >
          {lastCastSpell?.name ??
            (isRevealingSpell ? "Revealing..." : castHistory.length === collectionTotal ? "Collection complete" : "Ready")}
        </h2>
        {lastCastSpell ? (
          <div className="spell-detail-reveal mt-3">
            <p className="text-sm text-[var(--text-body)]">
              {formatSpellLevel(lastCastSpell.level)} {lastCastSpell.school.toLowerCase()} ·{" "}
              {lastCastSpell.damageOrCondition} · {lastCastSpell.area}
            </p>
            <SpellDetailsLink spell={lastCastSpell} className="mt-3" />
          </div>
        ) : (
          <p className="mt-3 text-sm text-[var(--text-muted)]">
            {castHistory.length === collectionTotal
              ? "Every available spell has been collected."
              : "Draw a complete, uncollected spell glyph."}
          </p>
        )}
      </section>

      <div className="grid w-full items-start gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div>
          <p className="mb-4 w-full text-center text-sm text-[var(--text-muted)]">
            {possibleSpellCount} possible {possibleSpellCount === 1 ? "spell" : "spells"}
          </p>
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
        </div>

        <aside className="cast-history-panel grid gap-6 rounded-lg border p-4 shadow-glyph lg:sticky lg:top-8">
          <DiscoveredKeysPanel
            keys={unlockedCollectorKeys}
            canApply={canInteractWithBoard}
            canApplyKey={getCanApplyCollectorKey}
            isAppliedKey={getIsAppliedCollectorKey}
            onApplyKey={handleApplyCollectorKey}
            eyebrow="Unlocked Keys"
            title="Collector Keys"
            emptyText="Collect more spells to unlock your first key."
            sortMode={collectorKeySortMode}
            onSortModeChange={setCollectorKeySortMode}
            isCollapsible
          />
          <CastHistoryPanel
            history={castHistory}
            eyebrow="Collection"
            title="Collected Spells"
            emptyText="Cast a complete glyph to collect your first spell."
            sortMode={castHistorySortMode}
            onSortModeChange={setCastHistorySortMode}
            isCollapsible
          />
        </aside>
      </div>

      {collectorKeyCelebrations[0] ? (
        <div
          className="pause-modal-backdrop fixed inset-0 z-40 grid place-items-center overflow-y-auto p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="collector-key-dialog-title"
        >
          <CollectorKeyCelebrationDialog
            celebration={collectorKeyCelebrations[0]}
            remainingCount={collectorKeyCelebrations.length - 1}
            onContinue={handleContinueCollectorKeyCelebration}
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
        {routeId === "cast" ? (
          <CastPage />
        ) : routeId === "gallery" ? (
          <SpellGalleryPage />
        ) : routeId === "keys" ? (
          <AttributeKeysPage />
        ) : (
          <PuzzlePage />
        )}
      </div>
    </main>
  );
}

export default App;
