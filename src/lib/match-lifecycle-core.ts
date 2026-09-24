export type MatchLifecycle =
  | "OPEN"
  | "TEAM_DRAFT"
  | "TEAM_CONFIRMED"
  | "RESULT_RECORDED"
  | "CANCELLED";

export type MatchLifecycleContext = {
  lifecycle: MatchLifecycle;
  draftId: string | null;
  confirmedId: string | null;
  hasDraftDraw: boolean;
  hasResult: boolean;
};

export type TeamVersionLifecycleRow = {
  id: string;
  status: "DRAFT" | "CONFIRMED" | "SUPERSEDED";
  randomKey: string | null;
  initialDrawSnapshot: unknown;
  metrics: unknown;
};

function metricsRecord(metrics: unknown): Record<string, unknown> {
  if (typeof metrics === "string") {
    try {
      return metricsRecord(JSON.parse(metrics));
    } catch {
      return {};
    }
  }
  return metrics && typeof metrics === "object" && !Array.isArray(metrics)
    ? (metrics as Record<string, unknown>)
    : {};
}

export function getMatchResultChargeTypeId(metrics: unknown) {
  const record = metricsRecord(metrics);
  return typeof record.resultChargeTypeId === "string" && record.resultChargeTypeId.trim()
    ? record.resultChargeTypeId
    : null;
}

export function hasRecordedMatchResult(metrics: unknown) {
  const record = metricsRecord(metrics);
  if (typeof record.resultRecordedAt === "string" && record.resultRecordedAt.trim()) return true;

  const placements = record.placements;
  if (!placements || typeof placements !== "object" || Array.isArray(placements)) return false;
  return Object.values(placements).some(
    (place) => typeof place === "number" && Number.isFinite(place) && place >= 1,
  );
}

export function deriveMatchLifecycle(input: {
  deletedAt: Date | null;
  versions: TeamVersionLifecycleRow[];
}): MatchLifecycleContext {
  const draft = input.versions.find((version) => version.status === "DRAFT") ?? null;
  const confirmed = input.versions.find((version) => version.status === "CONFIRMED") ?? null;
  const hasDraftDraw = Boolean(draft?.randomKey || draft?.initialDrawSnapshot);
  const hasResult = Boolean(confirmed && hasRecordedMatchResult(confirmed.metrics));

  if (input.deletedAt) {
    return {
      lifecycle: "CANCELLED",
      draftId: draft?.id ?? null,
      confirmedId: confirmed?.id ?? null,
      hasDraftDraw,
      hasResult,
    };
  }

  if (hasResult) {
    return {
      lifecycle: "RESULT_RECORDED",
      draftId: draft?.id ?? null,
      confirmedId: confirmed?.id ?? null,
      hasDraftDraw,
      hasResult: true,
    };
  }

  if (draft) {
    return {
      lifecycle: "TEAM_DRAFT",
      draftId: draft.id,
      confirmedId: confirmed?.id ?? null,
      hasDraftDraw,
      hasResult: false,
    };
  }

  if (confirmed) {
    return {
      lifecycle: "TEAM_CONFIRMED",
      draftId: null,
      confirmedId: confirmed.id,
      hasDraftDraw: false,
      hasResult: false,
    };
  }

  return {
    lifecycle: "OPEN",
    draftId: null,
    confirmedId: null,
    hasDraftDraw: false,
    hasResult: false,
  };
}

export function canEditMatchRoster(context: MatchLifecycleContext, isAdmin: boolean) {
  if (context.lifecycle === "OPEN") return true;
  if (context.lifecycle === "TEAM_DRAFT") {
    if (context.confirmedId) return false;
    return !context.hasDraftDraw || isAdmin;
  }
  return false;
}

export function canCreateTeamVersion(context: MatchLifecycleContext) {
  return context.lifecycle === "TEAM_CONFIRMED";
}

export function canReplaceOrAddConfirmedPlayer(context: MatchLifecycleContext) {
  return context.lifecycle === "TEAM_CONFIRMED";
}

export function canRecordMatchResult(context: MatchLifecycleContext) {
  return context.lifecycle === "TEAM_CONFIRMED" || context.lifecycle === "RESULT_RECORDED";
}

export function canCancelMatchResult(context: MatchLifecycleContext) {
  return context.lifecycle === "RESULT_RECORDED";
}

export function canCancelMatch(context: MatchLifecycleContext) {
  return context.lifecycle === "OPEN"
    || context.lifecycle === "TEAM_DRAFT"
    || context.lifecycle === "TEAM_CONFIRMED";
}

export function isMatchRsvpClosed(context: MatchLifecycleContext) {
  return context.lifecycle === "CANCELLED"
    || context.lifecycle === "TEAM_CONFIRMED"
    || context.lifecycle === "RESULT_RECORDED"
    || (context.lifecycle === "TEAM_DRAFT" && context.hasDraftDraw);
}
