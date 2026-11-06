import type { Metadata } from "next";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { parseFaqs } from "@/lib/affiliate";
import { categoryOf, factsOf } from "@/lib/catalog";
import { currentVotes, dealComments, siteClient, siteCoupon, siteCoupons, siteStoreById } from "@/lib/public-site";
import { getReader } from "@/lib/reader";
import { couponIdOf, threadComments, timeAgo } from "@/lib/community";
import { badgeInSentence, conditionsOf, lowerFirst, mentionsBadge } from "@/lib/deal-text";
import { aboutParagraphs, aboutSnippet } from "@/lib/deal-about";
import { daysBetween, dealPath, longDate, madridToday, parseDealId, siteUrl } from "@/lib/site-text";
import { CommentForm } from "./comment-form";
import { CommentItem } from "./comment-item";
import { CopyCode } from "../../copy-code";
import { StoreLogoImg } from "../../store-logo-img";
import { Crumbs, Faqs, GoButton, JsonLd, StatusBadges, StoreThumb, VoteColumn, badgeOf, crumbsLd, faqLd, isWordBadge, offerLd, priceClass, shortDate, titleOf } from "../../site-ui";

async function load(param: string) {
  const id = parseDealId(param);
  return id ? siteCoupon(id) : undefined;
}

export async function generateMetadata({ params }: PageProps<"/chollos/[deal]">): Promise<Metadata> {
  const found = await load((await params).deal);
  if (!found) return { title: "Chollo no encontrado", robots: { index: false } };
  const { coupon: c, live } = found;
  const badge = badgeOf(c);
  const what = c.kind === "code" ? `Código descuento ${c.store_name}` : `Oferta ${c.store_name}`;
  return {
    title: `${what}: ${titleOf(c)}`,
    description: [
      c.about_status === "approved" ? aboutSnippet(c.about) : "",
      `${badge} en ${c.store_name}${c.kind === "code" && c.code ? ` con el código ${c.code}` : ""}.`,
      c.expires_at ? `${live ? "Válido hasta" : "Caducó"} el ${longDate(c.expires_at)}.` : "",
      conditionsOf(c.description, c.title).join(". "),
    ]
      .filter(Boolean)
      .join(" ")
      .slice(0, 300),
    alternates: { canonical: dealPath(c) },
    openGraph: { title: `${what}: ${titleOf(c)}`, url: dealPath(c) },
  };
}

export default async function DealPage({ params, searchParams }: PageProps<"/chollos/[deal]">) {
  const param = (await params).deal;
  const found = await load(param);
  if (!found) notFound();
  const { coupon: c, live } = found;
  // old or mistyped words after the id: send readers and crawlers to the one canonical URL
  if (`/chollos/${param}` !== dealPath(c)) permanentRedirect(dealPath(c));

  const reader = await getReader();
  const [client, store, all, mine, comments] = await Promise.all([
    siteClient(),
    siteStoreById(c.store_id),
    siteCoupons(),
    currentVotes(),
    dealComments(c.id, reader?.id ?? null),
  ]);
  const replyingTo = couponIdOf(String((await searchParams).responder ?? ""));
  const threads = threadComments(comments);
  const now = new Date();
  const { iso: today } = madridToday();
  const base = siteUrl();
  const badge = badgeOf(c);
  const hasCode = c.kind === "code" && !!c.code;
  const storeFaqs = parseFaqs(store?.faqs ?? "");
  const cat = categoryOf(store?.category ?? "");
  const facts = factsOf(store?.facts ?? "");
  // "Envío | …" in the store's facts → the value, for the buy box
  const fact = (label: string) => facts.find((x) => x.label.toLowerCase().startsWith(label))?.value;
  // similar deals: same store first, then the same category, then anything live
  const rank = (o: typeof c) => (o.store_id === c.store_id ? 0 : cat && o.store_category === cat.slug ? 1 : 2);
  const related = all
    .filter((o) => o.id !== c.id)
    .map((o, i) => ({ o, r: rank(o), i }))
    .sort((a, b) => a.r - b.r || a.i - b.i)
    .slice(0, 3)
    .map((x) => x.o);
  const fromStore = related.filter((o) => o.store_id === c.store_id).length;
  const left = c.expires_at ? daysBetween(today, c.expires_at) : null;
  const published = new Date(c.created_at).toLocaleDateString("sv-SE", { timeZone: "Europe/Madrid" });
  const crumbs = [
    { name: "Inicio", href: "/" },
    { name: "Chollos", href: "/" },
    cat ? { name: cat.label, href: `/?cat=${cat.slug}` } : { name: c.store_name, href: `/tiendas/${c.store_slug}` },
    { name: titleOf(c) },
  ];
  const conds = conditionsOf(c.description, c.title);
  const about = c.about_status === "approved" ? aboutParagraphs(c.about) : [];
  const wordBadge = isWordBadge(c);

  const verdictTitle = live
    ? `¿Merece la pena? ${c.verified ? "Sí, está comprobado y activo." : "Sí, está activo."}`
    : "Este cupón ya no funciona";
  const verdict = live
    ? `${hasCode ? `Con el código ${c.code}` : "Sin código"} tienes ${wordBadge ? (hasCode ? "este descuento" : "esta oferta") : badgeInSentence(badge)} en ${c.store_name}. ${
        c.expires_at
          ? `Es válido hasta el ${longDate(c.expires_at)}${left !== null && left <= 7 ? `, ${left <= 0 ? "caduca hoy" : left === 1 ? "caduca mañana" : `quedan ${left} días`}` : ""}.`
          : "No tiene fecha de caducidad anunciada."
      } ${c.verified ? "Está marcado como comprobado porque viene de la red de afiliación de la tienda o lo ha revisado una persona del equipo." : "Todavía no lo ha comprobado nadie."}${
        conds.length ? ` Antes de usarlo, revisa las condiciones (${conds.map(lowerFirst).join(", ")}).` : ""
      }`
    : `Este cupón de ${c.store_name} caducó el ${longDate(c.expires_at)}.${fromStore ? ` Abajo tienes cupones de ${c.store_name} que siguen activos.` : ""}`;

  const steps = hasCode
    ? [
        <><b>Copia el código {c.code}</b> con el botón «Copiar».</>,
        <><b>Entra en {c.store_name}</b> desde «Ir a {c.store_name}» y añade lo que quieras comprar al carrito.</>,
        <><b>Pega el código</b> en el campo de código descuento o cupón antes de pagar.</>,
        <><b>Comprueba el total:</b> el descuento aparece antes de confirmar el pedido.</>,
      ]
    : [
        <><b>Entra en {c.store_name}</b> desde «Ir a {c.store_name}». El descuento ya está aplicado, no hace falta código.</>,
        <><b>Añade los productos al carrito</b> y revisa que cumplen las condiciones.</>,
        <><b>Comprueba el total</b> antes de pagar.</>,
      ];

  const conditions: [string, string][] = [
    ["Descuento", wordBadge ? (hasCode ? `Con el código ${c.code}` : "Oferta sin código") : `${badge}${hasCode ? ` con el código ${c.code}` : ", sin código"}`],
    // stock only limits deals; a code lasts until its date
    ["Válido hasta", c.expires_at ? `${longDate(c.expires_at)}${hasCode ? "" : " o hasta agotar existencias"}` : "Sin fecha de caducidad anunciada"],
    ["Estado", live ? (c.verified ? "Activo y comprobado" : "Activo") : "Caducado"],
    ["Condiciones", conds.length ? conds.join(" · ") : "Las generales de la tienda"],
    ["Tienda", c.store_website.replace(/^https?:\/\//, "").replace(/\/$/, "")],
    ["Publicado", longDate(published)],
    ...facts.map((x): [string, string] => [x.label, x.value]),
  ];

  return (
    <main className="wrap">
      <JsonLd data={offerLd(base, c, live)} />
      <JsonLd data={crumbsLd(base, crumbs)} />
      {storeFaqs.length > 0 && <JsonLd data={faqLd(storeFaqs)} />}

      <Crumbs items={crumbs} />

      <div className="dt-top">
        <div className="dt-main">
          <Link href="/" className="back">
            ← Volver a los chollos de hoy
          </Link>
          <section className="dt-hero">
            <StoreThumb c={c} className="dt-img" />
            <div>
              <div className="deal-head">
                <Link className="store" href={`/tiendas/${c.store_slug}`}>
                  <StoreLogoImg slug={c.store_slug} name={c.store_name} hasLogo={c.store_has_logo} className="slogo" />
                  {c.store_name}
                </Link>
                <StatusBadges c={c} today={today} live={live} />
              </div>
              <h1 data-seo="H1: producto + tienda">{titleOf(c)}</h1>
              <div className="dt-meta">
                <span>{c.expires_at ? <>{live ? "Válido hasta el" : "Caducó el"} <b>{shortDate(c.expires_at)}</b></> : "Sin fecha de caducidad"}</span>
                <span>Publicado el <b>{shortDate(published)}</b></span>
                {c.shared_by_handle && <span>Compartido por <b>@{c.shared_by_handle}</b> · {timeAgo(new Date(c.created_at), new Date())}</span>}
                {hasCode && <span>Código <b>{c.code}</b></span>}
              </div>
            </div>
          </section>

          <section className={`verdict${live ? "" : " meh"}`} data-seo="Respuesta citable (GEO)">
            <h2>{verdictTitle}</h2>
            <p>{verdict}</p>
          </section>

          {about.length > 0 && (
            <section className="dt-sec" data-seo="Texto propio del chollo">
              <h2>Sobre este chollo</h2>
              <div className="prose">
                {about.map((p, i) => (
                  <p key={i}>{p}</p>
                ))}
              </div>
            </section>
          )}

          <section className="dt-sec" data-seo="Condiciones claras">
            <h2>Condiciones del cupón</h2>
            <dl className="kv">
              {conditions.map(([k, v]) => (
                <div key={k} style={{ display: "contents" }}>
                  <dt>{k}</dt>
                  <dd>{v}</dd>
                </div>
              ))}
            </dl>
          </section>

          {live && (
            <section className="dt-sec" data-seo="HowTo: pasos">
              <h2>{hasCode ? `Cómo usar el código ${c.code}` : "Cómo conseguir este descuento"}</h2>
              <ol className="howto">
                {steps.map((s, i) => (
                  <li key={i}>
                    <span>{s}</span>
                  </li>
                ))}
              </ol>
            </section>
          )}

          {store?.intro && (
            <section className="dt-sec" data-seo="Texto único por tienda">
              <h2>Lo que conviene saber de {c.store_name}</h2>
              <p className="lead">{store.intro}</p>
            </section>
          )}

          {storeFaqs.length > 0 && (
            <section className="dt-sec">
              <h2>Preguntas sobre los descuentos de {c.store_name}</h2>
              <Faqs items={storeFaqs} />
            </section>
          )}

          {(live || comments.length > 0) && (
          <section className="dt-sec" id="comentarios" data-seo="Contenido de la comunidad">
            <h2>{comments.length === 1 ? "1 comentario" : `${comments.length} comentarios`}</h2>
            <div className="comments">
              {threads.map(({ comment: m, replies }) => {
                const item = (x: typeof m) => (
                  <CommentItem key={x.id} m={x} now={now} path={dealPath(c)} couponId={c.id} live={live} viewer={reader} replying={replyingTo === x.id} />
                );
                return [item(m), ...replies.map(item)];
              })}
              {live &&
                (!reader ? (
                  <div className="cm-form">
                    <Link href={`/entrar?next=${encodeURIComponent(`${dealPath(c)}#comentarios`)}`}>Entra para comentar</Link>
                  </div>
                ) : !reader.handle ? (
                  <div className="cm-form">
                    <Link href={`/entrar/nombre?next=${encodeURIComponent(dealPath(c))}`}>Elige un nombre de usuario para comentar</Link>
                  </div>
                ) : (
                  <CommentForm couponId={c.id} />
                ))}
            </div>
          </section>
          )}

          {related.length > 0 && (
            <section className="dt-sec" data-seo="Enlazado interno">
              <h2>Chollos parecidos</h2>
              <div className="related">
                {related.map((o) => {
                  const t = titleOf(o);
                  const b = badgeOf(o);
                  return (
                    <Link key={o.id} className="rel" href={dealPath(o)}>
                      <span className="ti">
                        <StoreLogoImg slug={o.store_slug} name={o.store_name} hasLogo={o.store_has_logo} />
                      </span>
                      <span>
                        <b>{t}</b>
                        <span>
                          {o.store_name}
                          {!isWordBadge(o) && !mentionsBadge(t, b) && <> · <em>{b}</em></>}
                        </span>
                      </span>
                    </Link>
                  );
                })}
              </div>
              {fromStore > 0 && <Link href={`/tiendas/${c.store_slug}`}>Ver todos los cupones de {c.store_name}</Link>}
            </section>
          )}
        </div>

        <aside className="buybox" aria-label="Usar el cupón">
          <div className="vote-row">
            <VoteColumn couponId={c.id} score={c.score} mine={mine.get(c.id) ?? 0} next={dealPath(c)} readOnly={!live} />
            <span className="small">votos de la comunidad</span>
          </div>
          <div className="prices">
            <span className={priceClass(c)}>{badge}</span>
            <span className="price-kind">en {c.store_name}</span>
          </div>
          {live ? (
            <>
              {hasCode && <CopyCode code={c.code} />}
              <GoButton client={client} c={c} />
            </>
          ) : (
            <Link className="btn" href={`/tiendas/${c.store_slug}`}>
              Ver cupones activos de {c.store_name}
            </Link>
          )}
          <ul className="facts">
            {fact("envío") && <li>Envío: <b>{fact("envío")}</b></li>}
            {fact("devoluciones") && <li>Devoluciones: <b>{fact("devoluciones")}</b></li>}
            <li>{c.expires_at ? <>{live ? "Caduca" : "Caducó"} el <b>{shortDate(c.expires_at)}</b></> : "Sin fecha de caducidad"}</li>
            {c.verified ? <li><b>Comprobado</b>, de la red de la tienda o revisado por el equipo</li> : null}
            {fact("códigos por pedido") ? <li>Códigos por pedido: <b>{fact("códigos por pedido")}</b></li> : <li>Un código por pedido salvo que la tienda diga otra cosa</li>}
          </ul>
          <p className="small" data-seo="Aviso de afiliación">Enlace de afiliado: si compras, la tienda nos paga una comisión y tu precio no cambia.</p>
        </aside>
      </div>

      {live && (
        <div className="mbar">
          {hasCode ? <CopyCode code={c.code} /> : <span className={priceClass(c)}>{badge}</span>}
          <GoButton client={client} c={c} label="Ir a la tienda" />
        </div>
      )}
    </main>
  );
}
