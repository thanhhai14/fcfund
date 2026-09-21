"use client";

import { useMemo, useState } from "react";
import { Disclosure } from "./disclosure";
import { Icon } from "./icon";
import { MemberIdentity } from "./member-identity";
import { MutationForm, SubmitButton } from "./mutation-form";
import type { MatchRsvpResult } from "@/app/(app)/matches/actions";

type RsvpStatus = "GOING" | "NOT_GOING";

type RsvpMember = {
  id: string;
  name: string;
  avatarUpdatedAt: Date | string | number | null;
  status: RsvpStatus | null;
  goalkeeperAvailable: boolean;
};

export function MatchRsvpDisclosure({
  matchId,
  disabled,
  myStatus,
  myGoalkeeperAvailable,
  members,
  action,
}: {
  matchId: string;
  disabled: boolean;
  myStatus: RsvpStatus | null;
  myGoalkeeperAvailable: boolean;
  members: RsvpMember[];
  action: (formData: FormData) => Promise<MatchRsvpResult>;
}) {
  const [view, setView] = useState<"vote" | "going" | "not-going" | "pending">("vote");
  const grouped = useMemo(() => ({
    going: members.filter((member) => member.status === "GOING"),
    notGoing: members.filter((member) => member.status === "NOT_GOING"),
    pending: members.filter((member) => member.status === null),
  }), [members]);

  const label = disabled
    ? <><Icon name="ban" /> Bình chọn đã đóng</>
    : myStatus === "GOING"
      ? <><Icon name="check" /> Đã tham gia</>
      : myStatus === "NOT_GOING"
        ? <><Icon name="ban" /> Không tham gia</>
        : <><Icon name="thumbs-up" /> Bình chọn</>;

  return (
    <Disclosure label={label} className="match-rsvp-disclosure match-popover">
      <div className="match-rsvp-heading">
        <span className="eyebrow">Bình chọn tham gia</span>
        <h3>Trạng thái trận đấu</h3>
        <p>{disabled ? "Đội hình đã được bốc thăm nên bình chọn đã khóa." : "Bạn có thể thay đổi lựa chọn cho đến khi trận được chia đội."}</p>
      </div>

      <div className="match-rsvp-summary">
        <button type="button" className={view === "going" ? "active" : ""} onClick={() => setView("going")}>
          <strong>{grouped.going.length}</strong><span>Tham gia</span>
        </button>
        <button type="button" className={view === "not-going" ? "active" : ""} onClick={() => setView("not-going")}>
          <strong>{grouped.notGoing.length}</strong><span>Không đi</span>
        </button>
        <button type="button" className={view === "pending" ? "active" : ""} onClick={() => setView("pending")}>
          <strong>{grouped.pending.length}</strong><span>Chưa trả lời</span>
        </button>
      </div>

      {view === "vote" && (
        <MutationForm action={action} className="match-rsvp-form">
          <input type="hidden" name="matchId" value={matchId} />
          <fieldset disabled={disabled}>
            <legend>Lựa chọn của bạn</legend>
            <label className="match-rsvp-option">
              <input type="radio" name="status" value="GOING" defaultChecked={myStatus === "GOING"} required />
              <span><strong>Tham gia</strong><small>Tự động thêm bạn vào danh sách trận.</small></span>
            </label>
            <label className="match-rsvp-option">
              <input type="radio" name="status" value="NOT_GOING" defaultChecked={myStatus === "NOT_GOING"} required />
              <span><strong>Không tham gia</strong><small>Ghi nhận bạn không tham dự trận này.</small></span>
            </label>

            <label className="match-rsvp-goalkeeper">
              <input type="checkbox" name="goalkeeperAvailable" defaultChecked={myGoalkeeperAvailable} />
              <span><strong>Có thể chụp gôn</strong><small>Chỉ áp dụng khi bạn chọn Tham gia.</small></span>
            </label>
          </fieldset>

          <div className="form-actions">
            <SubmitButton disabled={disabled} pendingLabel="Đang lưu…">Lưu bình chọn</SubmitButton>
            <button type="button" className="button secondary" onClick={() => setView("going")}>Xem thống kê</button>
          </div>
        </MutationForm>
      )}

      {view !== "vote" && (
        <div className="match-rsvp-list">
          <div className="match-rsvp-list-head">
            <button type="button" className="button secondary small" onClick={() => setView("vote")}>← Quay lại bình chọn</button>
          </div>
          {(view === "going" ? grouped.going : view === "not-going" ? grouped.notGoing : grouped.pending).map((member) => (
            <div className="match-rsvp-member" key={member.id}>
              <MemberIdentity memberId={member.id} name={member.name} avatarVersion={member.avatarUpdatedAt} compact />
              <span className={"match-rsvp-state " + (member.status?.toLowerCase() ?? "pending")}>
                {member.status === "GOING"
                  ? <><Icon name="check" /> Tham gia{member.goalkeeperAvailable ? " · 🧤" : ""}</>
                  : member.status === "NOT_GOING"
                    ? <><Icon name="ban" /> Không đi</>
                    : <>Chưa trả lời</>}
              </span>
            </div>
          ))}
          {((view === "going" && !grouped.going.length) || (view === "not-going" && !grouped.notGoing.length) || (view === "pending" && !grouped.pending.length)) && (
            <p className="empty-state-inline">Không có thành viên trong nhóm này.</p>
          )}
        </div>
      )}
    </Disclosure>
  );
}
