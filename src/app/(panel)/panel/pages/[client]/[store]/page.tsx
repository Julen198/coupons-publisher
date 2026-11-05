import Link from "next/link";
import { networkLabel, storeTracked } from "@/lib/affiliate";
import { notFound } from "next/navigation";
import { canEdit, canSeeClient, requireUser } from "@/lib/auth";
import { getClient, getPage, getStore, listCoupons } from "@/lib/db";
import { isPublic, statusOf, today } from "@/lib/coupon-status";
import { publishUnverified } from "@/lib/settings";
import { parseFaqs, pageTitle } from "@/lib/affiliate";
import { coverageOf } from "@/lib/page-status";
import { CoverageBadge } from "@/app/ui";
import { PageGenerator } from "./page-generator";

// Awin link = merchant id + the client's affiliate id, or else the publisher id of our account that imported the coupons
function awinCheck(clientId: string, merchantId: string, ourId: string) {
  if (!merchantId) return { ok: false, text: "Falta el merchant ID de Awin: los enlaces irán sin tracking" };
  if (clientId) return { ok: true, text: "Enlaces con el affiliate ID del medio" };
  if (ourId) return { ok: true, text: `Enlaces con nuestro publisher ID de Awin (${ourId}); el medio no tiene affiliate ID propio` };
  return { ok: false, text: "Faltan IDs de Awin: los enlaces irán sin tracking" };
}

export default async function GeneratorPage({ params, searchParams }: PageProps<"/panel/pages/[client]/[store]">) {
  const [{ client: clientSlug, store: storeSlug }, sp] = await Promise.all([params, searchParams]);
  const user = await requireUser();
  const [client, store] = await Promise.all([getClient(clientSlug), getStore(storeSlug)]);
  if (!client || !store || !canSeeClient(user, client.id)) notFound();
  const [page, coupons] = await Promise.all([getPage(client.id, store.id), listCoupons(store.id)]);
  const now = new Date();
  const t = today(now);
  const unverified = await publishUnverified();
  const live = coupons.filter((c) => isPublic(c, t, unverified));

  const checks = [
    { ok: true, text: `Título: «${pageTitle(store.name, live.map((c) => c.discount), now)}»` },
    { ok: live.length > 0, text: live.length ? `${live.length} cupones visibles` : "No hay cupones visibles" },
    store.network === "awin"
      ? awinCheck(client.awin_affiliate_id, store.merchant_id, store.publisher_id || live.find((c) => c.publisher_id)?.publisher_id || "")
      : { ok: storeTracked(store), text: storeTracked(store) ? `Enlaces de ${networkLabel(store.network)} con el subid del medio` : `Falta el enlace de ${networkLabel(store.network)}: los enlaces irán sin tracking` },
    { ok: parseFaqs(store.faqs).length >= 3, text: `${parseFaqs(store.faqs).length} FAQs con datos estructurados` },
    ...(live.some((c) => statusOf(c, t) === "pending") ? [{ ok: false, text: `${live.filter((c) => statusOf(c, t) === "pending").length} cupón(es) sin verificar se mostrarán` }] : []),
  ];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        {/* back to wherever you came from: the client's page or the Páginas list */}
        {sp.desde === "cliente"
          ? <Link href={`/panel/clients/${client.slug}`} className="text-sm text-neutral-500 hover:underline">← {client.name}</Link>
          : <Link href="/panel/pages" className="text-sm text-neutral-500 hover:underline">← Páginas</Link>}
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold">{store.name} en {client.name}</h1>
          <CoverageBadge coverage={coverageOf(page, now)} />
        </div>
      </div>
      {/* remount after each save: React resets the form's radios to their defaults after an action */}
      <PageGenerator
        key={`${page?.status}-${page?.delivery}-${page?.published_at?.getTime()}`}
        client={{ slug: client.slug, name: client.name, domain: client.domain }}
        store={{ slug: store.slug, name: store.name }}
        initialDelivery={page?.delivery ?? "widget"}
        published={page?.status === "published"}
        exists={Boolean(page)}
        readOnly={!canEdit(user)}
        checks={checks}
        faqCount={parseFaqs(store.faqs).length}
        autoFaqs={sp.nueva === "1"}
        fromClient={sp.desde === "cliente"}
      />
    </div>
  );
}
