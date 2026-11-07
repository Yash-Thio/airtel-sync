import Link from "next/link";
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from "react";

export function Button({
  variant = "primary",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" }) {
  const cls = `btn ${variant === "primary" ? "btn-primary" : "btn-secondary"} ${className}`.trim();
  return <button className={cls} {...props} />;
}

export function ButtonLink({
  href,
  variant = "primary",
  className = "",
  children,
}: {
  href: string;
  variant?: "primary" | "secondary";
  className?: string;
  children: ReactNode;
}) {
  const cls = `btn ${variant === "primary" ? "btn-primary" : "btn-secondary"} ${className}`.trim();
  return (
    <Link href={href} className={cls}>
      {children}
    </Link>
  );
}

export function Field({
  label,
  ...input
}: { label: string } & InputHTMLAttributes<HTMLInputElement>) {
  const id = input.id || input.name;
  return (
    <label className="field-label" htmlFor={id}>
      {label}
      <input id={id} className="field" {...input} />
    </label>
  );
}
