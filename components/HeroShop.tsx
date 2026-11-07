
"use client";

import type { ReactNode } from "react";
import { useLang } from "./LanguageProvider";

export default function HeroShop() {
  const { t } = useLang();

  return (
    <div className="hero-art">
      {/* Soft decorative background */}
      <div className="hero-art-glow" />

      {/* Store illustration */}
      <svg
        className="hero-shop"
        viewBox="0 0 520 420"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        {/* Ground */}
        <path className="shop-line" d="M75 355 H455" />

        {/* Store structure */}
        <path
          className="shop-line"
          d="M157 165 V355 H373 V165"
        />

        {/* Roof */}
        <path
          className="shop-line"
          d="M140 145 H390 L373 165 H157 Z"
        />

        {/* Awning top */}
        <path
          className="shop-line"
          d="M140 145 H390 V165"
        />

        {/* Awning scallops */}
        <path
          className="shop-line"
          d="
            M140 165
            C140 195 172 195 172 165
            C172 195 204 195 204 165
            C204 195 236 195 236 165
            C236 195 268 195 268 165
            C268 195 300 195 300 165
            C300 195 332 195 332 165
            C332 195 364 195 364 165
            C364 195 390 195 390 165
          "
        />

        {/* Window frame */}
        <rect
          className="shop-line"
          x="180"
          y="218"
          width="88"
          height="85"
          rx="2"
        />

        {/* Window divisions */}
        <path
          className="shop-line"
          d="M224 218 V303 M180 260 H268"
        />

        {/* Door */}
        <rect
          className="shop-line"
          x="295"
          y="210"
          width="55"
          height="145"
          rx="2"
        />

        {/* Door glass */}
        <rect
          className="shop-line shop-detail"
          x="304"
          y="220"
          width="37"
          height="100"
          rx="1"
        />

        {/* Door handle */}
        <circle
          cx="337"
          cy="330"
          r="3"
          fill="currentColor"
        />

        {/* Plant pot */}
        <path
          className="shop-line"
          d="M103 331 H151 L145 355 H109 Z"
        />

        {/* Plant stem */}
        <path
          className="shop-line"
          d="M127 331 V285"
        />

        {/* Plant leaves */}
        <path
          className="shop-line"
          d="
            M127 320
            C103 308 91 286 101 271
            C118 282 126 302 127 320
          "
        />
        <path
          className="shop-line"
          d="
            M127 312
            C146 299 158 277 147 263
            C132 275 126 294 127 312
          "
        />
        <path
          className="shop-line"
          d="
            M126 302
            C113 283 115 262 128 251
            C139 268 135 286 126 302
          "
        />

        {/* Small architectural details */}
        <path
          className="shop-line shop-detail"
          d="M157 355 H373"
        />
      </svg>

      {/* Floating service chips */}
      <Chip
        className="chip-net"
        label={t("home.chip.net")}
      >
        <path d="M4.5 9.5C8.5 5.5 15.5 5.5 19.5 9.5" />
        <path d="M7.5 12.5C10 10 14 10 16.5 12.5" />
        <path d="M10.5 15.5C11.5 14.5 12.5 14.5 13.5 15.5" />
        <circle cx="12" cy="18" r="1" fill="currentColor" stroke="none" />
      </Chip>

      <Chip
        className="chip-chat"
        label={t("home.chip.chat")}
      >
        <path d="M5 6.5H19V16H11L6 20V16H5Z" />
        <circle cx="9" cy="11.5" r="0.8" fill="currentColor" stroke="none" />
        <circle cx="12" cy="11.5" r="0.8" fill="currentColor" stroke="none" />
        <circle cx="15" cy="11.5" r="0.8" fill="currentColor" stroke="none" />
      </Chip>

      <Chip
        className="chip-sims"
        label={t("home.chip.sims")}
      >
        <path d="M7 4H14L18 8V19H6V5Z" />
        <path d="M14 4V8H18" />
        <path d="M9 12H15M9 15H15" />
      </Chip>

      <Chip
        className="chip-cloud"
        label={t("home.chip.cloud")}
      >
        <path d="M7.5 17H17A4 4 0 0 0 17 9A5.5 5.5 0 0 0 6.5 10A3.5 3.5 0 0 0 7.5 17Z" />
      </Chip>

      <Chip
        className="chip-cctv"
        label={t("home.chip.cctv")}
      >
        <path d="M4 9H16L20 12V16H4Z" />
        <circle cx="10" cy="12.5" r="2" />
        <path d="M7 16L5 20M16 16L18 19" />
      </Chip>
    </div>
  );
}

function Chip({
  className,
  label,
  children,
}: {
  className: string;
  label: string;
  children: ReactNode;
}) {
  return (
    <span className={`hero-chip ${className}`}>
      <svg
        viewBox="0 0 24 24"
        width="22"
        height="22"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        {children}
      </svg>
      <span>{label}</span>
    </span>
  );
}
