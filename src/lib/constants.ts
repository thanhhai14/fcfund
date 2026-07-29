export const DEFAULT_PASSWORD = "Trailang123";
export const APP_NAME = "FCFUND";
export const APP_TIMEZONE = "Asia/Ho_Chi_Minh";

export const PERMISSIONS = {
  DASHBOARD_VIEW: "dashboard.view",
  MEMBERS_VIEW: "members.view",
  MEMBERS_MANAGE: "members.manage",
  CHARGES_VIEW_OWN: "charges.view_own",
  CHARGES_VIEW_ALL: "charges.view_all",
  CHARGES_MANAGE: "charges.manage",
  PAYMENTS_VIEW_OWN: "payments.view_own",
  PAYMENTS_VIEW_ALL: "payments.view_all",
  PAYMENTS_MANAGE: "payments.manage",
  EXPENSES_VIEW: "expenses.view",
  EXPENSES_MANAGE: "expenses.manage",
  MATCHES_VIEW: "matches.view",
  MATCHES_MANAGE: "matches.manage",
  CLUB_BALANCE_VIEW: "club_balance.view",
  OTHER_MEMBER_BALANCES_VIEW: "member_balances.view_all",
  SETTINGS_MANAGE: "settings.manage",
  USERS_MANAGE: "users.manage",
  AUDIT_VIEW: "audit.view",
} as const;

export type PermissionKey = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export const PERMISSION_DEFINITIONS: Array<{
  key: PermissionKey;
  name: string;
  description: string;
}> = [
  { key: PERMISSIONS.DASHBOARD_VIEW, name: "Xem tổng quan", description: "Truy cập dashboard" },
  { key: PERMISSIONS.MEMBERS_VIEW, name: "Xem thành viên", description: "Xem danh sách thành viên" },
  { key: PERMISSIONS.MEMBERS_MANAGE, name: "Quản lý thành viên", description: "Thêm và cập nhật thành viên" },
  { key: PERMISSIONS.CHARGES_VIEW_OWN, name: "Xem khoản thu cá nhân", description: "Xem khoản phải đóng của chính mình" },
  { key: PERMISSIONS.CHARGES_VIEW_ALL, name: "Xem toàn bộ khoản thu", description: "Xem khoản phải đóng của cả đội" },
  { key: PERMISSIONS.CHARGES_MANAGE, name: "Quản lý khoản thu", description: "Tạo, sửa và xóa khoản phải đóng" },
  { key: PERMISSIONS.PAYMENTS_VIEW_OWN, name: "Xem tiền nộp cá nhân", description: "Xem tiền đã nộp của chính mình" },
  { key: PERMISSIONS.PAYMENTS_VIEW_ALL, name: "Xem toàn bộ tiền nộp", description: "Xem tiền nộp của cả đội" },
  { key: PERMISSIONS.PAYMENTS_MANAGE, name: "Quản lý tiền nộp", description: "Ghi nhận, sửa và xóa tiền nộp" },
  { key: PERMISSIONS.EXPENSES_VIEW, name: "Xem thu chi", description: "Xem giao dịch thực tế của club" },
  { key: PERMISSIONS.EXPENSES_MANAGE, name: "Quản lý thu chi", description: "Tạo, sửa và xóa thu chi" },
  { key: PERMISSIONS.MATCHES_VIEW, name: "Xem trận", description: "Xem lịch sử trận và người tham gia" },
  { key: PERMISSIONS.MATCHES_MANAGE, name: "Quản lý trận", description: "Tạo và cập nhật trận" },
  { key: PERMISSIONS.CLUB_BALANCE_VIEW, name: "Xem số dư quỹ", description: "Xem số tiền quỹ hiện tại" },
  { key: PERMISSIONS.OTHER_MEMBER_BALANCES_VIEW, name: "Xem công nợ người khác", description: "Xem số dư của thành viên khác" },
  { key: PERMISSIONS.SETTINGS_MANAGE, name: "Quản lý cài đặt", description: "Cấu hình club, loại thu và QR" },
  { key: PERMISSIONS.USERS_MANAGE, name: "Quản lý tài khoản", description: "Tạo tài khoản, đặt lại mật khẩu và policy" },
  { key: PERMISSIONS.AUDIT_VIEW, name: "Xem chatter", description: "Xem lịch sử thay đổi" },
];

export const ROLE_LABELS = {
  ADMIN: "Admin",
  TREASURER: "Thủ quỹ",
  MEMBER: "Thành viên",
} as const;

export const ICON_ALLOWLIST = [
  "wallet",
  "calendar",
  "glass-water",
  "futbol",
  "triangle-exclamation",
  "coins",
  "hand-holding-dollar",
  "shirt",
  "trophy",
  "droplet",
  "money-bill-wave",
] as const;
