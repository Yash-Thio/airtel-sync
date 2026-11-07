"use client";

/**
 * kind: software. site-kind: software.
 * deal: hero triptych (one static set: advisor line + quote card; no carousel),
 * palette teal-on-paper, type reddit, nav without a photo panel,
 * footer-columns, close-type, rhythm dark-band (trust), buttons pill, mark stack.
 * Ground: paper with a CSS top glow. Grain shader is not mounted in this Next app.
 */

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { ButtonLink } from "@/components/ui";
import { useLang } from "@/components/LanguageProvider";
import HeroShop from "@/components/HeroShop";

const BUNDLES = ["salon", "kirana", "clinic", "restaurant", "factory"] as const;
const FAQ_IDS = [1, 2, 3, 4, 5, 6] as const;

export default function Home() {
  const { t } = useLang();
  return (
    <main id="main">
      <section className="hero" id="top">
        <HeroWash />
        <div className="wrap hero-main">
          <div className="hero-copy">
            <p className="hero-kicker">
              <span>{t("home.eyebrow")}</span>
              <i aria-hidden="true" />
            </p>
            <h1>{t("home.h1")}</h1>
            <p className="hero-lead">{t("home.lead")}</p>
            <div className="hero-actions">
              <ButtonLink href="/advisor">{t("nav.find")}</ButtonLink>
              <ButtonLink href="/orders" variant="secondary">
                {t("home.cta.track")}
              </ButtonLink>
            </div>
          </div>
          <HeroShop />
        </div>
        <div className="wrap hero-foot">
          <ul className="hero-points">
            <li>
              <BoltIcon />
              <span>{t("home.point.fast")}</span>
            </li>
            <li>
              <DocIcon />
              <span>{t("home.point.kyc")}</span>
            </li>
            <li>
              <PinIcon />
              <span>{t("home.point.live")}</span>
            </li>
          </ul>
        </div>
      </section>

      <section className="screen" id="steps">
        <div className="wrap">
          <h2>{t("home.steps.h")}</h2>
          <p className="lede">{t("home.steps.lead")}</p>
          <div className="step-grid">
            {([1, 2, 3, 4] as const).map((n) => (
              <article className="step-card" key={n}>
                <h3>{t(`home.step.${n}.t`)}</h3>
                <p>{t(`home.step.${n}.b`)}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="screen" id="bundles">
        <div className="wrap">
          <h2>{t("home.bundles.h")}</h2>
          <p className="lede">{t("home.bundles.lead")}</p>
          <div className="bundle-grid">
            {BUNDLES.map((id) => (
              <article className="bundle-card" key={id}>
                <h3>{t(`home.bundle.${id}.t`)}</h3>
                <p>{t(`home.bundle.${id}.b`)}</p>
                <p className="price">
                  {t("home.from")} <b translate="no">{t(`home.bundle.${id}.p`)}</b>{" "}
                  <span className="muted">{t("common.perMonth")}</span>
                </p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="screen verify-section" id="trust">
        <VerifyWash />
        <div className="wrap verify-grid">
          <div className="verify-copy">
            <p className="hero-kicker">
              <span>{t("home.trust.eyebrow")}</span>
              <i aria-hidden="true" />
            </p>
            <h2>{t("home.trust.h")}</h2>
            <p className="lede">{t("home.trust.lead")}</p>
          </div>

          <div className="verify-flow-wrap">
            <div className="verify-flow">
              <div className="verify-track" aria-hidden="true">
                <span className="verify-node verify-node--active">
                  <i />
                </span>
                <span className="verify-line" />
                <span className="verify-node" />
              </div>

              <div className="verify-steps">
                {/* Digital verification card */}
                <article className="verify-card verify-card--digital">
                  <div className="verify-card-left">
                    <span className="verify-icon-badge verify-icon-badge--digital">
                      <BoltIcon />
                    </span>
                    <div>
                      <h3>{t("home.trust.digital.t")}</h3>
                      <p>{t("home.trust.digital.b")}</p>
                    </div>
                  </div>
                  <div className="verify-badge">
                    <ClockIcon />
                    <span>{t("home.trust.digital.time")}</span>
                  </div>
                </article>

                {/* Manual verification card */}
                <article className="verify-card verify-card--manual">
                  <div className="verify-card-left">
                    <span className="verify-icon-badge verify-icon-badge--manual">
                      <DocIcon />
                    </span>
                    <div>
                      <h3>{t("home.trust.manual.t")}</h3>
                      <p>{t("home.trust.manual.b")}</p>
                    </div>
                  </div>
                  <div className="verify-badge">
                    <ClockIcon />
                    <span>{t("home.trust.manual.time")}</span>
                  </div>
                </article>
              </div>
            </div>

            {/* Activation section */}
            <div className="verify-activation">
              <span className="verify-activation-icon">
                <RadioIcon />
              </span>
              <div>
                <h3>{t("home.trust.activation.t")}</h3>
                <p>{t("home.trust.activation.b")}</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="screen screen-inv" id="questions">
        <div className="wrap">
          <h2>{t("home.faq.h")}</h2>
          <FaqList />
        </div>
      </section>

      <footer className="screen closing" id="close">
        <div className="wrap">
          <div className="close-row">
            <div>
              <h2>{t("home.close.h")}</h2>
              <p className="lede">{t("home.close.lead")}</p>
            </div>
            <ButtonLink href="/advisor">{t("nav.find")}</ButtonLink>
          </div>
          <div className="foot">
            <div>
              <LinkBrand name={t("app.name")} />
            </div>
            <div>
              <p className="foot-label">{t("home.foot.product")}</p>
              <Link href="/advisor">{t("nav.find")}</Link>
              <Link href="/orders">{t("nav.track")}</Link>
              <Link href="/login">{t("nav.login")}</Link>
            </div>
            <div>
              <p className="foot-label">{t("home.foot.journey")}</p>
              <Link href="/quote">{t("nav.quote")}</Link>
              <Link href="/kyc">{t("nav.kyc")}</Link>
              <Link href="/#steps">{t("home.steps.h")}</Link>
              <Link href="/#bundles">{t("home.bundles.h")}</Link>
            </div>
            <div>
              <p className="foot-label">{t("home.foot.languages")}</p>
              <p>English</p>
              <p lang="hi">हिन्दी</p>
              <p lang="ta">தமிழ்</p>
              <p lang="mr">मराठी</p>
            </div>
            <p className="legal">
              <span translate="no">{t("home.foot.legal")}</span>
              {" · "}
              {new Date().getFullYear()}
            </p>
          </div>
        </div>
      </footer>
    </main>
  );
}

function FaqList() {
  const { t } = useLang();
  const [open, setOpen] = useState<number | null>(1);

  return (
    <div className="faq-list">
      {FAQ_IDS.map((n) => {
        const expanded = open === n;
        const panelId = `faq-panel-${n}`;
        const buttonId = `faq-button-${n}`;
        return (
          <article key={n}>
            <h3>
              <button
                type="button"
                id={buttonId}
                className="faq-q"
                aria-expanded={expanded}
                aria-controls={panelId}
                onClick={() => setOpen(expanded ? null : n)}
              >
                <span>{t(`home.faq.${n}.q`)}</span>
                <span className="faq-mark" aria-hidden="true" />
              </button>
            </h3>
            <div id={panelId} role="region" aria-labelledby={buttonId} hidden={!expanded}>
              <p>{t(`home.faq.${n}.a`)}</p>
            </div>
          </article>
        );
      })}
    </div>
  );
}

function HeroWash() {
  return (
    <svg className="hero-wash" viewBox="0 0 1440 900" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <path fill="#e5f2ec" d="M900 150c140-80 320-30 500 20 30 8 40 40 40 70v180c-90 36-210-16-330-8-150 10-210-36-210-120 0-70-40-100 0-142z" />
      <path fill="#e3f0ea" d="M-20 690c220-90 400 30 640-24 210-48 390 36 560 4 80-16 180 8 260-18v150H-20V690z" />
      <path fill="#f7f9f8" d="M-20 790c260-36 500 22 780-8 230-24 420 18 680-10v140H-20V790z" />
    </svg>
  );
}

function LineIcon({ children }: { children: ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {children}
    </svg>
  );
}

function BoltIcon() {
  return (
    <LineIcon>
      <path d="M13 2.8 6.2 13.2h5.2L10 21.2 18.2 10.2h-5.4L13 2.8z" />
    </LineIcon>
  );
}

function DocIcon() {
  return (
    <LineIcon>
      <path d="M8 4.2h6.1L18 8.1V19a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1V5.2a1 1 0 0 1 1-1z" />
      <path d="M14 4.2V8.2h4" />
      <path d="M9.2 12.2h5.6M9.2 15.4h3.6" />
    </LineIcon>
  );
}

function PinIcon() {
  return (
    <LineIcon>
      <path d="M12 20.5s5.6-4.8 5.6-8.6a5.6 5.6 0 1 0-11.2 0c0 3.8 5.6 8.6 5.6 8.6z" />
      <circle cx="12" cy="11.7" r="1.6" />
    </LineIcon>
  );
}

function ClockIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <polyline points="12 6 12 12 15 14" />
    </svg>
  );
}

function RadioIcon() {
  return (
    <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="2" fill="currentColor" />
      <path d="M16.24 7.76a6 6 0 0 1 0 8.49m-8.48-.01a6 6 0 0 1 0-8.49m11.31-2.82a10 10 0 0 1 0 14.14m-14.14 0a10 10 0 0 1 0-14.14" />
    </svg>
  );
}

function VerifyWash() {
  return (
    <svg className="verify-wash" viewBox="0 0 1440 600" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <path fill="#f0f6f3" d="M-20 400c260-60 480 30 760-20 220-40 400 24 720-10v240H-20V400z" />
      <path fill="#e8f2ee" d="M600 500c200-40 380 20 860-30v140H600V500z" />
    </svg>
  );
}

function LinkBrand({ name }: { name: string }) {
  return (
    <a href="/#top" className="brand">
      <span className="mark" aria-hidden="true">
        <i />
        <i />
        <i />
      </span>
      <span translate="no">{name}</span>
    </a>
  );
}
