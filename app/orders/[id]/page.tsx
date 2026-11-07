"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useLang } from "@/components/LanguageProvider";
import "@/lib/i18n-quote";

interface Order {
  id: string;
  status: string;
  stages: string[];
  events: { status: string; ts: string; note?: string }[];
  expectedActivationDate?: string;
  items: { productId: string; name: string; unit: string; quantity: number; installDays: number; expectedInstallDate: string }[];
}

const fmtDate = (d: string, lang: string) =>
  new Date(d + "T00:00:00Z").toLocaleDateString(lang === "en" ? "en-IN" : lang + "-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

export default function OrderPage() {
  const { t, lang } = useLang();
  const id = decodeURIComponent(String(useParams().id ?? ""));
  const [order, setOrder] = useState<Order | null>(null);
  const [missing, setMissing] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const r = await fetch(`/api/orders/${encodeURIComponent(id)}`).catch(() => null);
    if (r?.ok) setOrder((await r.json()).order);
    else setMissing(true);
  }, [id]);
  useEffect(() => {
    load();
  }, [load]);

  const advance = async () => {
    setBusy(true);
    const r = await fetch(`/api/orders/${encodeURIComponent(id)}/advance`, { method: "POST" }).catch(() => null);
    if (r?.ok) setOrder((await r.json()).order);
    setBusy(false);
  };

  if (missing)
    return (
      <div className="mx-auto max-w-xl space-y-3">
        <p role="alert" className="text-red-700">{t("o.notFound")}</p>
        <Link href="/orders" className="underline">{t("o.lookup")}</Link>
      </div>
    );
  if (!order) return <p className="text-slate-600">{t("common.loading")}</p>;

  const cur = Math.max(0, order.stages.indexOf(order.status));
  const done = order.status === "activated";
  const lastNote = (st: string) => [...order.events].reverse().find((e) => e.status === st)?.note;

  return (
    <div className="mx-auto max-w-xl space-y-5">
      <div>
        <p className="text-sm text-slate-600">{t("o.order")}</p>
        <h1 className="font-mono text-2xl font-semibold">{order.id}</h1>
        {order.expectedActivationDate && (
          <p className="mt-1 text-sm">
            {t("o.expected")}: <b>{fmtDate(order.expectedActivationDate, lang)}</b>
          </p>
        )}
      </div>

      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="text-lg font-semibold">{t("o.timeline")}</h2>
        <ol className="mt-3">
          {order.stages.map((s, i) => {
            const state = i < cur || done ? "done" : i === cur ? "current" : "pending";
            const ev = order.events.find((e) => e.status === s);
            return (
              <li key={s} className="flex gap-3">
                <div className="flex flex-col items-center">
                  <span
                    className={`flex h-7 w-7 items-center justify-center rounded-full text-sm font-medium ${
                      state === "pending" ? "bg-surface text-muted" : "bg-ink text-action-ink"
                    }`}
                  >
                    {i + 1}
                  </span>
                  {i < order.stages.length - 1 && <span className={`w-0.5 flex-1 ${state === "done" ? "bg-ink" : "bg-surface"}`} style={{ minHeight: 24 }} />}
                </div>
                <div className="pb-4">
                  <p className={state === "pending" ? "text-slate-500" : "font-medium"}>{t(`orders.status.${s}`)}</p>
                  <p className="text-xs text-slate-500">
                    {state === "done" ? t("o.done") : state === "current" ? t("o.current") : t("o.pending")}
                    {ev && state !== "pending" && ` · ${new Date(ev.ts).toLocaleString(lang === "en" ? "en-IN" : lang + "-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}`}
                  </p>
                  {state !== "pending" && lastNote(s) && lang === "en" && <p className="text-xs text-slate-500">{lastNote(s)}</p>}
                </div>
              </li>
            );
          })}
        </ol>
      </section>

      <section className="card">
        <h2 className="text-lg font-medium">{t("o.next")}</h2>
        <p className="mt-1 text-base">{t(`o.next.${order.status}`)}</p>
        <p className="mt-2 text-base font-medium">{t("o.noCall")}</p>
      </section>

      {order.items.length > 0 && (
        <section className="rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="text-lg font-semibold">{t("o.products")}</h2>
          <ul className="mt-2 divide-y divide-slate-100">
            {order.items.map((it) => (
              <li key={it.productId} className="flex items-center justify-between gap-3 py-2 text-sm">
                <span>
                  {it.name} <span className="text-slate-500">× {it.quantity}</span>
                </span>
                <span className="text-right">
                  {t("o.days").replace("{n}", String(it.installDays)).replace(/\b1 days\b/, "1 day")}
                  <span className="block text-xs text-slate-500">{t("o.by").replace("{date}", fmtDate(it.expectedInstallDate, lang))}</span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {!done && (
        <div className="rounded-xl border border-dashed border-slate-300 p-4">
          <button onClick={advance} disabled={busy} className="btn btn-secondary">
            {t("o.advance")}
          </button>
          <p className="mt-1 text-xs text-slate-500">{t("o.advanceNote")}</p>
        </div>
      )}
    </div>
  );
}
