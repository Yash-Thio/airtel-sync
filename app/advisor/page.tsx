"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useLang } from "@/components/LanguageProvider";
import "@/lib/advisor/strings";
import type { AdvisorResponse, Chip, RecommendationView, ViewLine } from "@/lib/advisor/types";

const SESSION_KEY = "udyam.sessionId";

interface Msg {
  role: "user" | "assistant";
  content: string;
}

const inr = (n: number) => `₹${n.toLocaleString("en-IN")}`;

function LineRow({ l, t }: { l: ViewLine; t: (k: string) => string }) {
  return (
    <li className="rounded-lg border border-slate-200 bg-white p-3">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-sm font-medium text-slate-900">
          {l.name} <span className="text-slate-500">× {l.quantity}</span>
        </span>
        <span className="shrink-0 text-sm font-semibold text-slate-900">
          {inr(l.monthlyInr)}
          <span className="font-normal text-slate-500">{t("common.perMonth")}</span>
        </span>
      </div>
      <p className="mt-1 text-xs leading-relaxed text-slate-600">{l.why}</p>
    </li>
  );
}

function RecommendationCard({ rec, quoteUrl, onRestart, t }: { rec: RecommendationView; quoteUrl: string; onRestart: () => void; t: (k: string) => string }) {
  const range = t("adv.card.range").replace("{min}", rec.monthlyMinInr.toLocaleString("en-IN")).replace("{max}", rec.monthlyMaxInr.toLocaleString("en-IN"));
  return (
    <section className="card" aria-label={t("adv.recTitle")}>
      <p className="text-sm font-medium text-muted">{t("adv.recTitle")}</p>
      <p className="mt-1 text-sm text-slate-700">{rec.segmentLabel}</p>
      <div className="mt-3 flex items-end justify-between gap-3 rounded-xl bg-white p-3">
        <div>
          <p className="text-xs text-slate-500">{t("adv.card.monthly")}</p>
          <p className="text-3xl font-bold text-slate-900">
            {inr(rec.monthlyTotalInr)}
            <span className="text-sm font-normal text-slate-500">{t("common.perMonth")}</span>
          </p>
          <p className="text-xs text-slate-500">{range}</p>
        </div>
        <div className="text-right text-xs text-slate-600">
          <p>
            {t("adv.card.setup")}: <b>{inr(rec.setupTotalInr)}</b>
          </p>
          <p>
            {t("adv.card.contract")}: <b>{rec.contractMonths} {t("common.months")}</b>
          </p>
        </div>
      </div>
      <h3 className="mt-4 text-sm font-semibold text-slate-900">{t("adv.card.why")}</h3>
      <ul className="mt-2 space-y-2">
        {rec.lines.map((l) => (
          <LineRow key={l.productId} l={l} t={t} />
        ))}
      </ul>
      {rec.optional.length > 0 && (
        <>
          <h3 className="mt-4 text-sm font-semibold text-slate-900">{t("adv.card.optional")}</h3>
          <ul className="mt-2 space-y-2">
            {rec.optional.map((l) => (
              <LineRow key={l.productId} l={l} t={t} />
            ))}
          </ul>
        </>
      )}
      {rec.excluded.length > 0 && (
        <>
          <h3 className="mt-4 text-sm font-semibold text-slate-900">{t("adv.card.excluded")}</h3>
          <ul className="mt-2 space-y-1 text-xs text-slate-600">
            {rec.excluded.map((x) => (
              <li key={x.productId}>
                <b>{x.name}</b>: {x.reason}
              </li>
            ))}
          </ul>
        </>
      )}
      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        <Link href={quoteUrl} className="btn btn-primary flex-1">
          {t("adv.card.cta")}
        </Link>
        <button type="button" onClick={onRestart} className="btn btn-secondary">
          {t("adv.card.restart")}
        </button>
      </div>
    </section>
  );
}

export default function AdvisorPage() {
  const { lang, t } = useLang();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [chips, setChips] = useState<Chip[]>([]);
  const [rec, setRec] = useState<RecommendationView | null>(null);
  const [quoteUrl, setQuoteUrl] = useState("");
  const [typing, setTyping] = useState(false);
  const [input, setInput] = useState("");
  const [error, setError] = useState(false);
  const sessionRef = useRef<string | null>(null);
  const startedRef = useRef(false);
  const endRef = useRef<HTMLDivElement>(null);

  const apply = useCallback((r: AdvisorResponse, append: boolean) => {
    sessionRef.current = r.sessionId;
    localStorage.setItem(SESSION_KEY, r.sessionId);
    if (r.history) setMessages(r.history);
    else if (append) setMessages((m) => [...m, { role: "assistant", content: r.reply }]);
    setChips(r.chips);
    setRec(r.recommendation ?? null);
    setQuoteUrl(r.quoteUrl ?? "");
  }, []);

  const call = useCallback(
    async (body: Record<string, unknown>, append = true) => {
      setTyping(true);
      setError(false);
      try {
        const res = await fetch("/api/advisor/message", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ lang: localStorage.getItem("udyam.lang") ?? lang, sessionId: sessionRef.current ?? undefined, ...body }),
        });
        if (!res.ok) throw new Error(String(res.status));
        usedLangRef.current = localStorage.getItem("udyam.lang") ?? lang;
        apply((await res.json()) as AdvisorResponse, append);
      } catch {
        setError(true);
      } finally {
        setTyping(false);
      }
    },
    [lang, apply],
  );

  const start = useCallback(
    (fresh: boolean) => {
      if (fresh) {
        localStorage.removeItem(SESSION_KEY);
        sessionRef.current = null;
        setMessages([]);
        setRec(null);
        setChips([]);
      } else {
        sessionRef.current = localStorage.getItem(SESSION_KEY);
      }
      void call({ init: !!sessionRef.current, sessionId: sessionRef.current ?? undefined }, true);
    },
    [call],
  );

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    start(false);
  }, [start]);

  // If the language is switched before the user has answered anything, restart so the greeting and chips are localised.
  const usedLangRef = useRef<string | null>(null);
  useEffect(() => {
    if (typing || !messages.length || rec || !usedLangRef.current) return;
    if (usedLangRef.current === lang) return;
    if (messages.some((m) => m.role === "user")) return;
    start(true);
  }, [lang, typing, messages, rec, start]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, typing, rec]);

  const send = (text: string, display?: string) => {
    const v = text.trim();
    if (!v || typing) return;
    setMessages((m) => [...m, { role: "user", content: display ?? v }]);
    setChips([]);
    setInput("");
    void call({ text: v });
  };

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-3 pb-28">
      <h1 className="text-xl font-semibold text-slate-900">{t("advisor.title")}</h1>
      <div className="flex flex-col gap-2" aria-live="polite">
        {messages.map((m, i) => (
          <div key={i} className={`max-w-[88%] whitespace-pre-wrap rounded-2xl px-4 py-2 text-sm leading-relaxed ${m.role === "user" ? "self-end bg-slate-900 text-white" : "self-start border border-slate-200 bg-white text-slate-800"}`}>
            {m.content}
          </div>
        ))}
        {typing && (
          <p className="self-start text-sm text-muted" role="status">
            {t("adv.typing")}
          </p>
        )}
        {error && (
          <p className="self-start rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
            {t("adv.error")}
          </p>
        )}
      </div>
      {rec && !typing && <RecommendationCard rec={rec} quoteUrl={quoteUrl} onRestart={() => start(true)} t={t} />}
      <div ref={endRef} />

      <div className="composer">
        <div className="mx-auto max-w-xl">
          {chips.length > 0 && !typing && (
            <div className="mb-2 flex gap-2 overflow-x-auto pb-1">
              {chips.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  onClick={() => send(c.value, c.label)}
                  className="shrink-0 rounded-full border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-800 hover:bg-slate-100"
                >
                  {c.label}
                </button>
              ))}
            </div>
          )}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              send(input);
            }}
            className="flex gap-2"
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={t("advisor.placeholder")}
              aria-label={t("advisor.placeholder")}
              className="field mt-0 min-w-0 flex-1 rounded-full"
            />
            <button type="submit" disabled={typing || !input.trim()} className="btn btn-primary">
              {t("common.send")}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
