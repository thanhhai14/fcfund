"use client";

import { useState } from "react";
import { Icon } from "./icon";
import { ICON_OPTIONS } from "@/lib/constants";

export function ChargeTypeFields({
  calculation = "MONTHLY",
  amount = 0,
  iconName = "wallet",
  color = "#ef7198",
  reportAsIcon = false,
  isLossPenalty = false,
  includeStatus = false,
  isActive = true,
}: {
  calculation?: "MONTHLY" | "OCCURRENCE";
  amount?: number;
  iconName?: string;
  color?: string | null;
  reportAsIcon?: boolean;
  isLossPenalty?: boolean;
  includeStatus?: boolean;
  isActive?: boolean;
}) {
  const [selectedIcon, setSelectedIcon] = useState(iconName);
  const [selectedColor, setSelectedColor] = useState(color || "#ef7198");

  return (
    <>
      <div className="form-row">
        <label>
          Cách tính
          <select name="calculation" defaultValue={calculation}>
            <option value="MONTHLY">Theo tháng</option>
            <option value="OCCURRENCE">Theo số lần</option>
          </select>
        </label>
        <label>
          Đơn giá
          <input name="amount" type="number" min="0" defaultValue={amount} required />
        </label>
      </div>
      <div className="icon-config-grid">
        <label>
          Font Awesome icon
          <select
            name="iconName"
            value={selectedIcon}
            onChange={(event) => setSelectedIcon(event.target.value)}
          >
            {ICON_OPTIONS.map((icon) => (
              <option value={icon.value} key={icon.value}>{icon.label} · {icon.value}</option>
            ))}
          </select>
        </label>
        <label>
          Màu icon
          <span className="color-field">
            <input
              name="color"
              type="color"
              value={selectedColor}
              onChange={(event) => setSelectedColor(event.target.value)}
            />
            <code>{selectedColor.toUpperCase()}</code>
          </span>
        </label>
        <div className="icon-live-preview">
          <span style={{ color: selectedColor, borderColor: selectedColor }}>
            <Icon name={selectedIcon} />
          </span>
          <small>Xem trước</small>
        </div>
      </div>
      <label className="check-field report-mode-field">
        <input name="reportAsIcon" type="checkbox" defaultChecked={reportAsIcon} />
        <span>
          <strong>Hiển thị bằng icon trong báo cáo tháng</strong>
          <small>Số icon tương ứng với số lần phát sinh; nếu tắt sẽ hiển thị số tiền.</small>
        </span>
      </label>
      <label className="check-field penalty-mode-field">
        <input name="isLossPenalty" type="checkbox" defaultChecked={isLossPenalty} />
        <span>
          <strong>Tính là phạt thua khi chia đội</strong>
          <small>Khoản phát sinh theo trận sẽ được dùng để suy luận phong độ thua.</small>
        </span>
      </label>
      {includeStatus && (
        <label className="check-field">
          <input name="isActive" type="checkbox" defaultChecked={isActive} />
          Đang sử dụng loại thu này
        </label>
      )}
    </>
  );
}
