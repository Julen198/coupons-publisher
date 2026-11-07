import Link from "next/link";
import { networkLabel } from "@/lib/affiliate";
import { isTracked, trackedLinkOf, type TrackedLink } from "@/lib/tracked-link";
import { accountsFor, clientLinks } from "@/lib/link-accounts";
import { notFound } from "next/navigation";
import { canEdit, canSeeClient, requireUser } from "@/lib/auth";
import { getClient, getPage, getStore, listCoupons } from "@/lib/db";
import { isPublic, statusOf, today } from "@/lib/coupon-status";
import { publishUnverified } from "@/lib/settings";
import { parseFaqs, pageTitle } from "@/lib/affiliate";
import { coverageOf } from "@/lib/page-status";
import { CoverageBadge } from "@/app/ui";
import { PageGenerator } from "./page-generator";

// The links check, from the same gate as the public pages (trackedLinkOf): coupons without a tracked link stay out
function linkCheck(network: string, tracked: number, untracked: TrackedLink[]) {
  const first = untracked.find((l) => !isTracked(l));
  if (first && !isTracked(first)) return { ok: false, text: `${untracked.length} cupón(es) no se mostrarán porque su enlace no lleva tracking (${first.message.toLowerCase()})` };
  return { ok: tracked > 0, text: tracked ? `Enlaces de ${networkLabel(network)} con el subid del medio` : `Sin enlaces de ${networkLabel(network)} que comprobar` };
}

export default async function GeneratorPage({ params, searchParams }: PageProps<"/panel/pages/[client]/[store]">) {
  const [{ client: clientSlug, store: storeSlug }, sp] = await Promise.all([params, searchParams]);
  const user = await requireUser();
  const [client, store] = await Promise.all([getClient(clientSlug), getStore(storeSlug)]);
  if (!client || !store || !canSeeClient(user, client.id)) notFound();
  const [page, coupons] = await Promise.all([getPage(client.id, store.id), listCoupons(store.id)]);
  const now = new Date();
  const t = today(now);
  const [unverified, links] = await Promise.all([publishUnverified(), clientLinks(client)]);
  const accounts = accountsFor(links, store);
  const linkOf = new Map(coupons.map((c) => [c.id, trackedLinkOf(c, store, accounts)]));
  const publicOnes = coupons.filter((c) => isPublic(c, t, unverified));
  const live = publicOnes.filter((c) => isTracked(linkOf.get(c.id)!));
  const untracked = publicOnes.map((c) => linkOf.get(c.id)!).filter((l) => !isTracked(l));

  const checks = [
    { ok: true, text: `Título: «${pageTitle(store.name, live.map((c) => c.discount), now)}»` },
    { ok: live.length > 0, text: live.length ? `${live.length} cupones visibles` : "No hay cupones visibles" },
    linkCheck(store.network, live.length, untracked),
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
