"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useLang } from "@/components/LanguageProvider";
import "@/lib/i18n-quote";

interface O {
  id: string;
  status: string;
  expectedActivationDate?: string;
  createdAt: string;
}

export default function OrdersPage() {
  const { t } = useLang();
  const router = useRouter();
  const [id, setId] = useState("");
  const [err, setErr] = useState("");
  const [recent, setRecent] = useState<O[] | null>(null);
  const [signedIn, setSignedIn] = useState(false);

  useEffect(() => {
    fetch("/api/orders")
      .then(async (r) => {
        if (r.status === 401) {
          setSignedIn(false);
          setRecent(null);
          return;
        }
        const d = await r.json().catch(() => ({}));
        setSignedIn(true);
        setRecent(d.orders ?? []);
      })
      .catch(() => {
        setSignedIn(false);
        setRecent(null);
      });
  }, []);

  const go = async (e: React.FormEvent) => {
    e.preventDefault();
    const v = id.trim().toUpperCase();
    if (!v) return;
    const r = await fetch(`/api/orders/${encodeURIComponent(v)}`).catch(() => null);
    if (r?.status === 429) return setErr(t("o.tooMany"));
    if (r?.ok) router.push(`/orders/${encodeURIComponent(v)}`);
    else setErr(t("o.notFound"));
  };

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">{t("o.lookup")}</h1>
        <p className="mt-1 text-sm text-slate-600">{t("o.lookupHint")}</p>
      </div>
      <form onSubmit={go} className="flex gap-2">
        <input
          value={id}
          onChange={(e) => {
            setId(e.target.value);
            setErr("");
          }}
          placeholder={t("o.idPlaceholder")}
          aria-label={t("o.lookup")}
          name="trackingId"
          autoComplete="off"
          spellCheck={false}
          className="field mt-0 min-w-0 flex-1"
        />
        <button className="btn btn-primary">{t("o.track")}</button>
      </form>
      {err && <p role="alert" className="text-sm text-red-700">{err}</p>}
      {signedIn ? (
        <section>
          <h2 className="text-lg font-semibold">{t("o.recent")}</h2>
          {recent && !recent.length && <p className="mt-2 text-sm text-slate-600">{t("o.none")}</p>}
          <ul className="mt-2 space-y-2">
            {(recent ?? []).map((o) => (
              <li key={o.id}>
                <Link href={`/orders/${o.id}`} className="card lift flex items-center justify-between px-4 py-3">
                  <span className="font-mono text-sm">{o.id}</span>
                  <span className="text-sm text-slate-700">{t(`orders.status.${o.status}`)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : (
        <p className="text-sm text-slate-600">
          {t("o.signIn")}{" "}
          <Link href="/login?next=/orders" className="font-medium underline">
            {t("nav.login")}
          </Link>
        </p>
      )}
    </div>
  );
}
