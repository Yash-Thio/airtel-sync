"use client";

import { usePathname } from "next/navigation";
import Header from "./Header";
import Stepper from "./Stepper";

export default function Shell({ children }: { children: React.ReactNode }) {
  const path = usePathname() || "/";
  if (path === "/") {
    return (
      <>
        <Header />
        {children}
      </>
    );
  }
  const step = path.startsWith("/advisor")
    ? 0
    : path.startsWith("/quote")
      ? 1
      : path.startsWith("/kyc")
        ? 2
        : path.startsWith("/orders")
          ? 3
          : -1;
  const wide = path.startsWith("/backoffice");
  return (
    <>
      <Header />
      <main id="main" className={wide ? "app-main app-main--wide" : "app-main"}>
        {step >= 0 && <Stepper current={step} />}
        {children}
      </main>
    </>
  );
}
