import assert from "node:assert/strict";
import {
  canCancelMatch,
  canCancelMatchResult,
  canCreateTeamVersion,
  canEditMatchRoster,
  canReplaceOrAddConfirmedPlayer,
  deriveMatchLifecycle,
  isMatchRsvpClosed,
  type TeamVersionLifecycleRow,
} from "../src/lib/match-lifecycle-core";

function version(
  id: string,
  status: TeamVersionLifecycleRow["status"],
  overrides: Partial<TeamVersionLifecycleRow> = {},
): TeamVersionLifecycleRow {
  return {
    id,
    status,
    randomKey: null,
    initialDrawSnapshot: null,
    metrics: {},
    ...overrides,
  };
}

const open = deriveMatchLifecycle({ deletedAt: null, versions: [] });
assert.equal(open.lifecycle, "OPEN");
assert.equal(canEditMatchRoster(open, false), true);
assert.equal(canCancelMatch(open), true);
assert.equal(isMatchRsvpClosed(open), false);

const draft = deriveMatchLifecycle({
  deletedAt: null,
  versions: [version("d1", "DRAFT")],
});
assert.equal(draft.lifecycle, "TEAM_DRAFT");
assert.equal(draft.hasDraftDraw, false);
assert.equal(canEditMatchRoster(draft, false), true);
assert.equal(isMatchRsvpClosed(draft), false);

const drawnDraft = deriveMatchLifecycle({
  deletedAt: null,
  versions: [version("d2", "DRAFT", { randomKey: "draw-key" })],
});
assert.equal(drawnDraft.lifecycle, "TEAM_DRAFT");
assert.equal(drawnDraft.hasDraftDraw, true);
assert.equal(canEditMatchRoster(drawnDraft, false), false);
assert.equal(canEditMatchRoster(drawnDraft, true), true);
assert.equal(isMatchRsvpClosed(drawnDraft), true);

const confirmed = deriveMatchLifecycle({
  deletedAt: null,
  versions: [version("c1", "CONFIRMED")],
});
assert.equal(confirmed.lifecycle, "TEAM_CONFIRMED");
assert.equal(canCreateTeamVersion(confirmed), true);
assert.equal(canReplaceOrAddConfirmedPlayer(confirmed), true);
assert.equal(canCancelMatch(confirmed), true);
assert.equal(isMatchRsvpClosed(confirmed), true);

const versionedDraft = deriveMatchLifecycle({
  deletedAt: null,
  versions: [
    version("c-versioned", "CONFIRMED"),
    version("d-versioned", "DRAFT"),
  ],
});
assert.equal(versionedDraft.lifecycle, "TEAM_DRAFT");
assert.equal(versionedDraft.confirmedId, "c-versioned");
assert.equal(canEditMatchRoster(versionedDraft, true), false);
assert.equal(canEditMatchRoster(versionedDraft, false), false);

const result = deriveMatchLifecycle({
  deletedAt: null,
  versions: [version("c2", "CONFIRMED", {
    metrics: {
      placements: { "Đội A": 1, "Đội B": 2 },
      resultRecordedAt: "2026-09-24T10:00:00.000Z",
    },
  })],
});
assert.equal(result.lifecycle, "RESULT_RECORDED");
assert.equal(result.hasResult, true);
assert.equal(canCreateTeamVersion(result), false);
assert.equal(canReplaceOrAddConfirmedPlayer(result), false);
assert.equal(canCancelMatch(result), false);
assert.equal(canCancelMatchResult(result), true);

const resultWithLegacyPlacements = deriveMatchLifecycle({
  deletedAt: null,
  versions: [version("c3", "CONFIRMED", {
    metrics: { placements: { "Đội A": 1, "Đội B": 2 } },
  })],
});
assert.equal(resultWithLegacyPlacements.lifecycle, "RESULT_RECORDED");

const cancelled = deriveMatchLifecycle({
  deletedAt: new Date("2026-09-24T10:30:00.000Z"),
  versions: [version("c4", "CONFIRMED")],
});
assert.equal(cancelled.lifecycle, "CANCELLED");
assert.equal(canCancelMatch(cancelled), false);
assert.equal(isMatchRsvpClosed(cancelled), true);

const abnormalResultAndDraft = deriveMatchLifecycle({
  deletedAt: null,
  versions: [
    version("c5", "CONFIRMED", {
      metrics: { resultRecordedAt: "2026-09-24T10:00:00.000Z" },
    }),
    version("d3", "DRAFT"),
  ],
});
assert.equal(abnormalResultAndDraft.lifecycle, "RESULT_RECORDED");
assert.equal(canCreateTeamVersion(abnormalResultAndDraft), false);

console.log("Match lifecycle tests passed.");
