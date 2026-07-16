import type { ReactNode } from "react";
import type { Role } from "../lib/types";
import { CloseIcon } from "./icons";

export function Avatar({ name, small }: { name: string; small?: boolean }) {
  const initials = name
    .split(" ")
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
  return <div className={`avatar${small ? " avatar--sm" : ""}`}>{initials || "?"}</div>;
}

const ROLE_LABEL: Record<Role, string> = {
  ADMIN: "Admin",
  MAIN_LEADER: "Hlavný vedúci",
  LEADER: "Vedúci",
  MEMBER: "Účastník",
};

export function RoleBadge({ role }: { role: Role }) {
  if (role === "MEMBER") return null;
  return <span className={`badge badge--${role.toLowerCase()}`}>{ROLE_LABEL[role]}</span>;
}

export function StatusDot({ status }: { status?: "online" | "last_known" }) {
  const cls = status === "online" ? "dot--online" : status === "last_known" ? "dot--idle" : "dot--offline";
  return <span className={`dot ${cls}`} />;
}

export function Toggle({
  checked,
  onChange,
  disabled,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label className="switch">
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="switch__slider" />
    </label>
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <div className="segmented">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          className={`segmented__opt${opt.value === value ? " is-active" : ""}`}
          onClick={() => onChange(opt.value)}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

export function Sheet({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <div className="sheet__backdrop" onClick={onClose}>
      <div className="sheet__panel" onClick={(e) => e.stopPropagation()}>
        <div className="sheet__grip" />
        <div className="sheet__head">
          <h3 className="sheet__title">{title}</h3>
          <button className="btn btn--icon" onClick={onClose} aria-label="Zavrieť">
            <CloseIcon />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Empty({ icon, title, sub }: { icon: string; title: string; sub?: string }) {
  return (
    <div className="empty">
      <div className="empty__icon">{icon}</div>
      <div style={{ fontWeight: 600 }}>{title}</div>
      {sub && <div className="text-sm">{sub}</div>}
    </div>
  );
}
