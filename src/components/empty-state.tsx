import { Icon } from "./icon";

export function EmptyState({
  title,
  description,
  icon = "wallet",
}: {
  title: string;
  description: string;
  icon?: string;
}) {
  return (
    <div className="empty-state">
      <span><Icon name={icon} /></span>
      <h3>{title}</h3>
      <p>{description}</p>
    </div>
  );
}
