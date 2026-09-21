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

type RsvpActivity = {
  id: string;
  message: string;
  createdAt: Date | string;
};

export function MatchRsvpDisclosure({
  matchId,
  disabled,
  canVote,
  canRemind,
  defaultOpen,
  myStatus,
  myGoalkeeperAvailable,
  members,
  activities,
  action,
  reminderAction,
}: {
  matchId: string;
  disabled: boolean;
  canVote: boolean;
  canRemind: boolean;
  defaultOpen?: boolean;
  myStatus: RsvpStatus | null;
  myGoalkeeperAvailable: boolean;
  members: RsvpMember[];
  activities: RsvpActivity[];
  action: (formData: FormData) => Promise<MatchRsvpResult>;
  reminderAction: (formData: FormData) => Promise<MatchRsvpResult>;
}) {
  const [view, setView] = useState<"vote" | "going" | "not-going" | "pending">(canVote ? "vote" : "going");
  const grouped = useMemo(() => ({
    going: members.filter((member) => member.status === "GOING"),
    notGoing: members.filter((member) => member.status === "NOT_GOING"),
    pending: members.filter((member) => member.status === null),
  }), [members]);

  const label = !canVote
    ? <><Icon name="eye" /> Xem bình chọn</>
    : disabled
      ? <><Icon name="ban" /> Bình chọn đã đóng</>
      : myStatus === "GOING"
        ? <><Icon name="check" /> Đã tham gia</>
        : myStatus === "NOT_GOING"
          ? <><Icon name="ban" /> Không tham gia</>
          : <><Icon name="thumbs-up" /> Bình chọn</>;

  const selectedMembers = view === "going"
    ? grouped.going
    : view === "not-going"
      ? grouped.notGoing
      : grouped.pending;

  return (
    <Disclosure
      label={label}
      className="match-rsvp-disclosure match-popover"
      defaultOpen={defaultOpen}
    >
      <div className="match-rsvp-heading">
        <span className="eyebrow">Bình chọn tham gia</span>
        <h3>Trạng thái trận đấu</h3>
        <p>
          {!canVote
            ? "Tài khoản này không liên kết thành viên nên chỉ có thể xem kết quả bình chọn."
            : disabled
              ? "Đội hình đã được bốc thăm nên bình chọn đã khóa."
              : "Bạn có thể thay đổi lựa chọn cho đến khi trận được chia đội."}
        </p>
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

      {view === "vote" && canVote && (
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
        <div className="match-rsvp-stats">
          <div className="match-rsvp-list">
            <div className="match-rsvp-list-head">
              {canVote && (
                <button type="button" className="button secondary small" onClick={() => setView("vote")}>
                  ← Quay lại bình chọn
                </button>
              )}
            </div>
            {selectedMembers.map((member) => (
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
            {!selectedMembers.length && (
              <p className="empty-state-inline">Không có thành viên trong nhóm này.</p>
            )}
          </div>

          <section className="match-rsvp-activity">
            <div className="match-rsvp-activity-head">
              <div>
                <span className="eyebrow">Chatter</span>
                <h4>Lịch sử bình chọn</h4>
              </div>
              {canRemind && !disabled && (
                <MutationForm action={reminderAction} className="match-rsvp-reminder" messageMode="alert">
                  <input type="hidden" name="matchId" value={matchId} />
                  <SubmitButton variant="secondary" pendingLabel="Đang gửi…"><Icon name="bullhorn" /> Nhắc mọi người</SubmitButton>
                </MutationForm>
              )}
            </div>
            <div className="match-rsvp-activity-list">
              {activities.map((item) => (
                <div className="match-rsvp-activity-item" key={item.id}>
                  <strong>{item.message}</strong>
                  <small>{new Date(item.createdAt).toLocaleString("vi-VN")}</small>
                </div>
              ))}
              {!activities.length && <p className="empty-state-inline">Chưa có lịch sử bình chọn.</p>}
            </div>
          </section>
        </div>
      )}
    </Disclosure>
  );
}
