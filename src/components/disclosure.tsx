export function Disclosure({
  label,
  children,
  className,
}: {
  label: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <details className={`disclosure ${className ?? ""}`}>
      <summary>{label}</summary>
      <div className="disclosure-content">{children}</div>
    </details>
  );
}
