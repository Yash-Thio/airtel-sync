"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import LanguagePicker from "./LanguagePicker";
import { useLang } from "./LanguageProvider";

interface Me {
  name: string;
  businessName: string;
  phone: string;
}

export default function Header() {
  const { t } = useLang();
  const path = usePathname();
  const [user, setUser] = useState<Me | null>(null);
  const [open, setOpen] = useState(false);
  const [menu, setMenu] = useState(false);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setUser(d?.user ?? null))
      .catch(() => setUser(null));
  }, []);

  useEffect(() => {
    if (!menu && !open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setMenu(false);
        setOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menu, open]);

  const logout = async () => {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => null);
    setUser(null);
    setOpen(false);
    setMenu(false);
    window.location.href = "/";
  };

  return (
    <header className={path === "/" ? "site-nav site-nav--home" : "site-nav"}>
      <a className="skip" href="#main">
        {t("nav.skip")}
      </a>
      <div className="wrap nav-row">
        <button
          type="button"
          className="menu-btn"
          aria-label={menu ? t("nav.close") : t("nav.menu")}
          aria-expanded={menu}
          onClick={() => setMenu((v) => !v)}
        >
          <span />
        </button>
        <Link href="/#top" className="brand">
          <span className="mark" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
          <span translate="no">{t("app.name")}</span>
        </Link>
        <nav className="nav-links" aria-label={t("app.name")}>
          <Link href="/orders">{t("nav.track")}</Link>
          {user ? (
            <div className="account">
              <button type="button" className="nav-text" onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-haspopup="menu">
                {user.name}
              </button>
              {open && (
                <div className="account-panel" role="menu">
                  <p className="font-medium">{user.businessName}</p>
                  <p className="mt-1 text-sm text-muted">{user.phone}</p>
                  <Link href="/orders" className="text-link mt-3 inline-block" onClick={() => setOpen(false)}>
                    {t("nav.orders")}
                  </Link>
                  <button type="button" className="text-link mt-2 block" onClick={logout}>
                    {t("nav.logout")}
                  </button>
                </div>
              )}
            </div>
          ) : (
            <Link href="/login">{t("nav.login")}</Link>
          )}
        </nav>
        <div className="nav-end">
          <span className="nav-lang-desk">
            <LanguagePicker />
          </span>
          <Link href="/advisor" className="btn btn-primary nav-cta">
            {t("nav.find")}
          </Link>
        </div>
      </div>
      {menu && (
        <div className="nav-sheet">
          <Link href="/orders" onClick={() => setMenu(false)}>
            {t("nav.track")}
          </Link>
          {user ? (
            <>
              <Link href="/orders" onClick={() => setMenu(false)}>
                {user.name}
              </Link>
              <button type="button" className="sheet-link" onClick={logout}>
                {t("nav.logout")}
              </button>
            </>
          ) : (
            <Link href="/login" onClick={() => setMenu(false)}>
              {t("nav.login")}
            </Link>
          )}
          <div className="pt-4">
            <LanguagePicker />
          </div>
          <Link href="/advisor" className="btn btn-primary mt-4" onClick={() => setMenu(false)}>
            {t("nav.find")}
          </Link>
        </div>
      )}
    </header>
  );
}
