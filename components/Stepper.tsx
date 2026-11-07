"use client";

import Link from "next/link";
import { useLang } from "./LanguageProvider";

const STEPS = [
  { href: "/advisor", key: "step.advisor" },
  { href: "/quote", key: "step.quote" },
  { href: "/kyc", key: "step.kyc" },
  { href: "/orders", key: "step.track" },
] as const;

export default function Stepper({ current }: { current: number }) {
  const { t } = useLang();
  return (
    <nav className="stepper" aria-label={t("home.steps.h")}>
      {STEPS.map((s, i) => (
        <Link key={s.href} href={s.href} aria-current={i === current ? "step" : undefined}>
          <span className="step-n">{i + 1}</span>
          {t(s.key)}
        </Link>
      ))}
    </nav>
  );
}
