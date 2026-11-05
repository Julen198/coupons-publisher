# Reader accounts and community Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Readers of the public site sign in with an emailed link, vote deals up or down, comment, and share deals that an editor approves before they go live, as in the prototype.

**Architecture:** Readers are a separate table from panel users, with their own signed cookie (`cl_reader`) whose payload is domain-separated from the panel cookie. Votes and comments are rows keyed by reader and coupon. Scores, comment counts and the sharer's handle join into the existing public coupon query. A shared deal is an ordinary coupon row stored archived with `review = 'pending'`. An editor publishes or rejects it from a new panel page. All writes are server actions with server-side validation and per-reader rate limits.

**Tech Stack:** Next.js App Router (read `node_modules/next/dist/docs/` before writing server actions, `refresh`/`revalidatePath`, or route files), Postgres via `sql()` in `src/lib/db.ts`, Resend through `sendEmail` in `src/lib/email.ts`, tests with `node --test` (`npm test`).

**Spec:** `docs/superpowers/plans/2026-11-05-prototype-parity-roadmap.md` (row 3) and the prototype `/Users/julenpalazuelo/Downloads/CuponLab Chollos.html` (vote column, `.vote-row`, "Más votados" tab, `.deal-foot` "Compartido por @user · hace 3 h · N comentarios", `.comments`/`.cm`/`.cm-form` on the deal page, "Compartir chollo" button, 4th methodology step).

## Global Constraints

- Work only in the worktree `/Users/julenpalazuelo/Documents/projects/coupons-publisher-community` (branch `claude/community`). Another session is editing the main checkout. Do not touch it.
- Do not edit `coupons_source_check` or `network_accounts_network_check` in `src/lib/schema.ts`: the other session is changing them. Shared deals use `source = 'manual'` plus `shared_by`.
- Do not edit `src/app/nav.tsx`, `src/app/actions.ts`, `src/app/actions-admin.ts`, `src/app/actions-networks.ts`, `src/app/actions-pages.ts`, `src/app/(panel)/panel/page.tsx` or anything under `src/lib/networks/` or `src/lib/network-sync.ts` (other session). New actions go in new files.
- Schema changes are appended to the end of `SCHEMA_SQL`, idempotent, with `ENABLE ROW LEVEL SECURITY` on each new table like the existing ones. Run `npm run db:setup` twice; both runs must print `Tablas al día`.
- No sample or fake data on the public site. Scores and counts are real.
- No new dependencies.
- Public copy in Spanish, sentence case, no em dashes, no colons mid-sentence.
- Cookie `cl_reader`: httpOnly, `secure` in production, `sameSite: "lax"`, path `/`, 30 days. Panel cookie and reader cookie must never verify as each other.
- Limits: magic link once per email per 60 s (`MAGIC_LINK_COOLDOWN_SECONDS`), valid 15 min (`MAGIC_LINK_MINUTES`), single use. Handle 3 to 20 chars of `[a-z0-9_]`, stored lowercase, unique. Comment 2 to 1000 chars after trim, one per reader per 30 s. Shared deals 5 per reader per rolling 24 h.

## Review Focus

- A panel session cookie pasted into `cl_reader` (or the reverse) must not sign anyone in.
- Someone who requests a link for an email that has no account must see the same message as for an existing one (no account enumeration).
- Voting twice with the same value removes the vote, voting the opposite value flips it, and a signed-out click goes to `/entrar?next=<current path>` without losing the page.
- A shared deal never appears on the public site, in the sitemap or on clients' pages until an editor publishes it, and a rejected one never does.
- A blocked reader (`status = 'blocked'`) can't vote, comment or share, and their existing comments are hidden.

---

### Task 1: Reader session tokens

**Files:**
- Modify: `src/lib/session.ts`
- Test: `src/lib/session.test.ts`

**Interfaces:**
- Produces: `READER_COOKIE = "cl_reader"`; `signReader(secret: string, readerId: number, version: number): Promise<string>`; `verifyReader(secret: string | undefined, token: string | undefined): Promise<{ readerId: number; version: number } | null>`. Token format `r.<id>.<version>.<hmac>`, where the HMAC covers `r.<id>.<version>` with the same `hmac` helper.

- [ ] **Step 1: Write the failing tests**

```ts
test("reader tokens round-trip and are not panel tokens", async () => {
  const t = await signReader("s3cret", 7, 2);
  assert.deepEqual(await verifyReader("s3cret", t), { readerId: 7, version: 2 });
  assert.equal(await verifyReader("other", t), null);
  assert.equal(await verifySession("s3cret", t), null);
  assert.equal(await verifyReader("s3cret", await signSession("s3cret", 7, 2)), null);
  assert.equal(await verifyReader("s3cret", t.replace(".2.", ".3.")), null);
  assert.equal(await verifyReader(undefined, t), null);
});
```

- [ ] **Step 2: Run** `node --test src/lib/session.test.ts`. Expected: FAIL, `signReader` not exported.
- [ ] **Step 3: Implement** in `session.ts`, reusing `hmac` and `safeEqual`.
- [ ] **Step 4: Run** `node --test src/lib/session.test.ts`. Expected: PASS.
- [ ] **Step 5: Commit** `feat: reader session tokens separate from panel sessions`

### Task 2: Community schema and input rules

**Files:**
- Modify: `src/lib/schema.ts` (end of `SCHEMA_SQL`)
- Modify: `src/lib/db.ts` (`Coupon` type gets `shared_by: number | null; review: "" | "pending" | "rejected"`)
- Create: `src/lib/community.ts`
- Test: `src/lib/community.test.ts`
- Modify: every `Coupon` object literal `tsc` then rejects (for example `src/lib/render-page.test.ts`, `src/lib/demo-response.ts`)

**Interfaces:**
- Produces, SQL:
  - `readers(id serial PK, email text NOT NULL UNIQUE, handle text UNIQUE, status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','blocked')), session_version int NOT NULL DEFAULT 1, login_token_hash text UNIQUE, login_expires_at timestamptz, link_sent_at timestamptz, created_at timestamptz NOT NULL DEFAULT now())`
  - `votes(reader_id int REFERENCES readers ON DELETE CASCADE, coupon_id int REFERENCES coupons ON DELETE CASCADE, value smallint NOT NULL CHECK (value IN (-1, 1)), at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (reader_id, coupon_id))` plus index on `coupon_id`
  - `comments(id serial PK, coupon_id int NOT NULL REFERENCES coupons ON DELETE CASCADE, reader_id int NOT NULL REFERENCES readers ON DELETE CASCADE, body text NOT NULL, hidden smallint NOT NULL DEFAULT 0, created_at timestamptz NOT NULL DEFAULT now())` plus index on `(coupon_id, created_at)`
  - `coupons.shared_by int REFERENCES readers(id) ON DELETE SET NULL` and `coupons.review text NOT NULL DEFAULT '' CHECK (review IN ('', 'pending', 'rejected'))` (constraint name `coupons_review_check`)
  - Add `votes, comments, readers` to the `TRUNCATE` list in `WIPE_DATA_SQL`
- Produces, TS in `community.ts`:
  - `cleanHandle(raw: string): string | null` (trim, lowercase, `^[a-z0-9_]{3,20}$`, else `null`)
  - `cleanComment(raw: string): string | null` (trim, collapse 3+ newlines to 2, length 2 to 1000, else `null`)
  - `nextVote(current: -1 | 0 | 1, pressed: -1 | 1): -1 | 0 | 1` (same value clears, otherwise the pressed value)
  - `timeAgo(from: Date, now: Date): string` ("hace un momento" under 1 min, "hace N min", "hace N h", "hace N días", "hace 1 día")

- [ ] **Step 1: Write the failing tests**

```ts
test("cleanHandle", () => {
  assert.equal(cleanHandle("  Runner_Bilbo "), "runner_bilbo");
  assert.equal(cleanHandle("ab"), null);
  assert.equal(cleanHandle("con espacio"), null);
  assert.equal(cleanHandle("a".repeat(21)), null);
});
test("cleanComment", () => {
  assert.equal(cleanComment("  ok  "), "ok");
  assert.equal(cleanComment("a"), null);
  assert.equal(cleanComment("x".repeat(1001)), null);
  assert.equal(cleanComment("uno\n\n\n\ndos"), "uno\n\ndos");
});
test("nextVote toggles and flips", () => {
  assert.equal(nextVote(0, 1), 1);
  assert.equal(nextVote(1, 1), 0);
  assert.equal(nextVote(1, -1), -1);
  assert.equal(nextVote(-1, -1), 0);
});
test("timeAgo", () => {
  const now = new Date("2026-11-05T12:00:00Z");
  assert.equal(timeAgo(new Date("2026-11-05T11:59:30Z"), now), "hace un momento");
  assert.equal(timeAgo(new Date("2026-11-05T11:15:00Z"), now), "hace 45 min");
  assert.equal(timeAgo(new Date("2026-11-05T09:00:00Z"), now), "hace 3 h");
  assert.equal(timeAgo(new Date("2026-11-04T10:00:00Z"), now), "hace 1 día");
  assert.equal(timeAgo(new Date("2026-11-02T12:00:00Z"), now), "hace 3 días");
});
```

- [ ] **Step 2: Run** `node --test src/lib/community.test.ts`. Expected: FAIL, module not found.
- [ ] **Step 3: Implement** `community.ts`; append the SQL; extend `Coupon`; fix the literals `tsc` reports.
- [ ] **Step 4: Run** `npm test`, `npx tsc --noEmit -p . | grep -v '^.next/'` and `npm run db:setup` twice. Expected: tests PASS, no tsc errors outside `.next/`, both setups print `Tablas al día`.
- [ ] **Step 5: Commit** `feat: community tables and input rules`

### Task 3: Reader sign-in

**Files:**
- Create: `src/lib/reader.ts`
- Create: `src/app/(site)/entrar/page.tsx`, `src/app/(site)/entrar/entrar-form.tsx`
- Create: `src/app/(site)/entrar/confirmar/page.tsx` (POST button, like `src/app/login/magic`)
- Create: `src/app/(site)/entrar/nombre/page.tsx` (choose handle)
- Create: `src/app/(site)/actions-reader.ts` (`"use server"`)
- Modify: `src/lib/email.ts` (add `readerLinkEmail(link: string): Mail`, same `layout`, greeting "Hola" without a name)
- Modify: `src/proxy.ts` (`SITE` gets `/^\/entrar(\/(confirmar|nombre))?$/`, `/^\/compartir$/`; keep `X-Robots-Tag: noindex` off for them is fine, but give the three `/entrar*` pages `robots: { index: false }` metadata)

**Interfaces:**
- Consumes: `signReader`, `verifyReader`, `READER_COOKIE` (Task 1); `readers` table, `cleanHandle` (Task 2); `hashToken`, `appUrl`, `MAGIC_LINK_*`, `sendEmail` from `email.ts`; `safeNext` from `session.ts` (default must be `/` for readers: add an optional fallback parameter `safeNext(next, fallback = "/panel")`).
- Produces:
  - `type Reader = { id: number; email: string; handle: string | null; status: "active" | "blocked"; session_version: number }`
  - `getReader(): Promise<Reader | null>` (verifies cookie, loads row, requires `status = 'active'` and matching `session_version`)
  - Server actions `requestReaderLink(prev: FormState, f: FormData): Promise<FormState & { sent?: boolean }>`, `confirmReaderLink(f: FormData): Promise<void>`, `chooseHandle(prev: FormState, f: FormData): Promise<FormState>`, `signOutReader(): Promise<void>`

- [ ] **Step 1: Write the failing test** for the fallback in `src/lib/session.test.ts`:

```ts
test("safeNext falls back per caller", () => {
  assert.equal(safeNext("//evil.com", "/"), "/");
  assert.equal(safeNext(null, "/"), "/");
  assert.equal(safeNext("/chollos/5-x"), "/chollos/5-x");
  assert.equal(safeNext(undefined), "/panel");
});
```

- [ ] **Step 2: Run** `node --test src/lib/session.test.ts`. Expected: FAIL on the first assertion.
- [ ] **Step 3: Implement** the fallback, then the flow:
  - `requestReaderLink`: validate email shape, upsert the reader by lowercase email (`INSERT … ON CONFLICT (email) DO UPDATE`), skip sending when `link_sent_at` is within the cooldown, store `hashToken(token)` and expiry, email `${appUrl()}/entrar/confirmar?token=…&next=…`. Always return `{ sent: true }` for a valid email, whatever happened (no enumeration). Log send failures with `console.error("[reader-link]", e)`.
  - `confirmReaderLink`: consume the token in one `UPDATE … WHERE login_token_hash = … AND login_expires_at > now() AND status = 'active' RETURNING id, session_version, handle`, set the cookie, redirect to `/entrar/nombre?next=…` when `handle` is null, else to `safeNext(next, "/")`. An invalid or used token shows "Este enlace ya no sirve. Pide otro." with a link to `/entrar`.
  - `chooseHandle`: requires `getReader()`; `cleanHandle` or error "Usa de 3 a 20 letras, números o guiones bajos"; a unique violation gives "Ese nombre ya está cogido".
  - `signOutReader`: deletes the cookie and redirects to `/`.
  - `/entrar` copy: h1 "Entra en CuponLab", one email field, button "Enviarme el enlace", after sending "Si el email es correcto, te hemos enviado un enlace. Caduca en 15 minutos."
- [ ] **Step 4: Run** `npm test` and `npx eslint src/app/\(site\) src/lib`. Expected: PASS, no errors.
- [ ] **Step 5: Check by hand** in `npm run dev` with the email that owns the Resend account (onboarding sender only delivers there): request a link, open it, press the button, choose a handle, land on `next`. A second click on the same link shows the "ya no sirve" message.
- [ ] **Step 6: Commit** `feat: readers sign in with an emailed link`

### Task 4: Votes and "Más votados"

**Files:**
- Modify: `src/lib/public-site.ts` (`COUPON_SELECT`, `SiteCoupon`, new `readerVotes`)
- Modify: `src/lib/catalog.ts` (`HomeFilters.orden` keeps `"destacados"` as the default value)
- Modify: `src/app/(site)/page.tsx` (`sortDeals`, `sortTabs`, pass votes to cards)
- Modify: `src/app/(site)/site-ui.tsx` (`VoteColumn`, `DealCard` props)
- Modify: `src/app/(site)/chollos/[deal]/page.tsx` (buy box vote row)
- Modify: `src/app/(site)/actions-reader.ts` (add `vote`)
- Test: `src/lib/community.test.ts`

**Interfaces:**
- Consumes: `getReader` (Task 3), `nextVote` (Task 2).
- Produces:
  - `SiteCoupon.score: number` (sum of votes, 0 when none), `SiteCoupon.comments: number` (visible comments), `SiteCoupon.shared_by_handle: string | null`, joined in `COUPON_SELECT` with grouped subqueries (no N+1)
  - `readerVotes(readerId: number): Promise<Map<number, -1 | 1>>`
  - `byVotes(a: Pick<SiteCoupon, "score" | "verified" | "discount" | "id">, b: same): number` exported from `community.ts`: score desc, then verified desc, then `percentOf(discount)` desc, then id desc
  - Server action `vote(f: FormData): Promise<void>` with fields `coupon_id`, `value` (`"1"` or `"-1"`), `next`
  - `VoteColumn({ couponId, score, mine, next }: { couponId: number; score: number; mine: -1 | 0 | 1; next: string })`

- [ ] **Step 1: Write the failing test**

```ts
test("byVotes ranks by score, then checked, then discount, then newest", () => {
  const d = (id: number, score: number, verified = 0, discount = "") => ({ id, score, verified, discount });
  const list = [d(1, 0, 1, "10%"), d(2, 3), d(3, 0, 1, "30%"), d(4, -1, 1), d(5, 0, 0)];
  assert.deepEqual([...list].sort(byVotes).map((x) => x.id), [2, 3, 1, 5, 4]);
});
```

- [ ] **Step 2: Run** `node --test src/lib/community.test.ts`. Expected: FAIL, `byVotes` not exported.
- [ ] **Step 3: Implement.**
  - The sort tab for `orden = "destacados"` is labelled "Más votados" and uses `byVotes`. The tabs in order are "Más votados", "Nuevos", "Mayor ahorro" and "Caducan pronto", as in the prototype.
  - `vote` requires an active reader, else `redirect("/entrar?next=" + encodeURIComponent(safeNext(next, "/")))`. It reads the current value, applies `nextVote`, and upserts or deletes. It votes only on coupons `siteCoupon` returns as live. Then it calls `refresh()` (check its name in the installed Next docs) so the score updates.
  - `VoteColumn` is a `<form action={vote}>` with two submit buttons `name="value"`, so it works without client JS. `aria-pressed` reflects `mine`, and the score shows `+N` when positive, as in the prototype. The buttons are no longer disabled.
  - The home page, store page and deal page load `readerVotes` once per request when a reader is signed in.
- [ ] **Step 4: Run** `npm test` and eslint. Expected: PASS.
- [ ] **Step 5: Check by hand.** Signed out, a vote click lands on `/entrar?next=/`. Signed in, up shows `+1` with the up arrow pressed, a second up clears it, and down shows `-1`. "Más votados" puts the voted deal first.
- [ ] **Step 6: Commit** `feat: readers vote deals and Más votados ranks them`

### Task 5: Comments

**Files:**
- Modify: `src/lib/public-site.ts` (add `dealComments`)
- Modify: `src/app/(site)/chollos/[deal]/page.tsx` (comments section after "Chollos parecidos" is fine, prototype puts it before; follow the prototype: before "Chollos parecidos")
- Modify: `src/app/(site)/site-ui.tsx` (`DealCard` foot shows "N comentarios" linking to `dealPath(c) + "#comentarios"`)
- Create: `src/app/(site)/chollos/[deal]/comment-form.tsx` (client, `useActionState`)
- Modify: `src/app/(site)/actions-reader.ts` (add `postComment`)
- Modify: `src/app/(site)/site.css` (port `.comments`, `.cm`, `.cm-h`, `.cm p`, `.cm-f`, `.cm-form` from the prototype, scoped under `.cl`)

**Interfaces:**
- Consumes: `getReader` (Task 3), `cleanComment`, `timeAgo` (Task 2), `SiteCoupon.comments` (Task 4).
- Produces: `dealComments(couponId: number): Promise<{ id: number; handle: string; body: string; created_at: Date; by_sharer: boolean }[]>` (visible comments by active readers, oldest first, max 200); server action `postComment(prev: FormState, f: FormData): Promise<FormState>` with fields `coupon_id`, `body`.

- [ ] **Step 1: Implement.**
  - `postComment` requires an active reader with a handle, a live coupon and `cleanComment`. It returns "Escribe entre 2 y 1000 caracteres". It refuses within 30 s of that reader's last comment with "Espera unos segundos antes de volver a comentar". Then it inserts the comment and refreshes.
  - The section heading is `<h2 id="comentarios">{n} comentarios</h2>`, or "1 comentario". The `.cm-h` shows `@handle`, an "Autor" badge when `by_sharer`, and `timeAgo`. There is no "útiles" or "Responder" yet, because nothing backs them.
  - A signed-out reader sees "Entra para comentar" linking to `/entrar?next=<deal path>#comentarios`. A reader without a handle is sent to `/entrar/nombre`.
- [ ] **Step 2: Run** `npm test` and eslint. Expected: PASS.
- [ ] **Step 3: Check by hand.** Post a comment and it appears with your handle. A second one within 30 s shows the wait message. A 1-character comment shows the length message. The card on the home page shows "1 comentario".
- [ ] **Step 4: Commit** `feat: readers comment on deals`

### Task 6: Share a deal

**Files:**
- Create: `src/app/(site)/compartir/page.tsx`, `src/app/(site)/compartir/share-form.tsx`
- Modify: `src/app/(site)/actions-reader.ts` (add `shareDeal`)
- Modify: `src/app/(site)/site-header.tsx` (prototype `.top-actions` with one `btn btn-primary` "Compartir chollo" linking to `/compartir`)
- Modify: `src/app/(site)/site-ui.tsx` (`DealCard` foot "Compartido por @handle · <timeAgo(created_at)>" when `shared_by_handle`)
- Modify: `src/app/(site)/chollos/[deal]/page.tsx` (`dt-meta` shows the same line)
- Modify: `src/app/(site)/site.css` (`.top-actions` from the prototype)
- Modify: `src/lib/community.ts` + test (`parseSharedDeal`)

**Interfaces:**
- Consumes: `getReader`, `coupons.shared_by` / `review` (Task 2).
- Produces: `parseSharedDeal(get: (k: string) => string, storeSlugs: ReadonlySet<string>): { ok: true; value: { store: string; title: string; url: string; code: string; discount: string; description: string; expires_at: string } } | { ok: false; error: string }`; server action `shareDeal(prev: FormState, f: FormData): Promise<FormState & { done?: boolean }>`.

- [ ] **Step 1: Write the failing test**

```ts
test("parseSharedDeal validates a reader's deal", () => {
  const stores = new Set(["pccomponentes"]);
  const form = (o: Record<string, string>) => (k: string) => o[k] ?? "";
  const good = { store: "pccomponentes", title: "SSD 2 TB a 129 €", url: "https://www.pccomponentes.com/ssd", code: " ssd10 ", discount: "10%", description: "", expires_at: "2026-12-01" };
  assert.deepEqual(parseSharedDeal(form(good), stores), { ok: true, value: { ...good, code: "SSD10" } });
  assert.equal(parseSharedDeal(form({ ...good, store: "otra" }), stores).ok, false);
  assert.equal(parseSharedDeal(form({ ...good, url: "javascript:alert(1)" }), stores).ok, false);
  assert.equal(parseSharedDeal(form({ ...good, url: "http://x.es" }), stores).ok, false);
  assert.equal(parseSharedDeal(form({ ...good, title: "ab" }), stores).ok, false);
  assert.equal(parseSharedDeal(form({ ...good, expires_at: "mañana" }), stores).ok, false);
  assert.equal(parseSharedDeal(form({ ...good, expires_at: "" }), stores).ok, true);
});
```

  Rules: the title must be 5 to 120 chars. The URL must be `https:` only. The code is uppercased, has no spaces and is at most 40 chars. The discount is at most 40 chars. The description is at most 500 chars. `expires_at` must be `""` or a valid `YYYY-MM-DD`. Error messages are in Spanish and name the field.

- [ ] **Step 2: Run** `node --test src/lib/community.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.**
  - `/compartir` requires a reader with a handle. Otherwise it redirects to `/entrar?next=/compartir`.
  - The form's store field is a `<select>` of all stores by name, plus "¿No está tu tienda? Escríbenos en un comentario".
  - `shareDeal` refuses past 5 deals in 24 h with "Has compartido 5 chollos hoy. Vuelve mañana". It inserts a coupon with `kind = code ? 'code' : 'deal'`, `source = 'manual'`, `verified = 0`, `archived = 1`, `review = 'pending'`, `shared_by = reader.id` and `target_url = url`.
  - On success the form shows "Gracias. Lo revisamos y, si cumple las normas, lo publicamos en unas horas."
- [ ] **Step 4: Run** `npm test` and eslint. Expected: PASS.
- [ ] **Step 5: Check by hand.** Share one deal. It does not appear on `/`, `/tiendas/<slug>`, `/sitemap.xml` or `/chollos/<id>-…` (404).
- [ ] **Step 6: Commit** `feat: readers share deals for review`

### Task 7: Moderation in the panel and the methodology step

**Files:**
- Create: `src/app/(panel)/panel/moderacion/page.tsx` (URL `/panel/moderacion`; editors and admins; `requireEditor`)
- Create: `src/app/actions-community.ts` (`"use server"`)
- Modify: `src/app/(site)/page.tsx` (4th methodology step)

**Interfaces:**
- Consumes: Tasks 2 to 6.
- Produces: server actions `publishShared(f: FormData)`, `rejectShared(f: FormData)`, `setCommentHidden(f: FormData)` (fields `id`, `hidden`), `setReaderBlocked(f: FormData)` (fields `id`, `blocked`; blocking also bumps `session_version` so their cookie stops working).

- [ ] **Step 1: Implement.**
  - The page has two sections.
    - "Chollos compartidos": pending coupons, newest first. Each shows store, title, link, code, discount, `@handle` and time, with "Publicar" and "Rechazar" buttons.
    - "Comentarios recientes": the last 100 comments. Each shows deal title, `@handle`, body and time, with "Ocultar"/"Mostrar" and "Bloquear a @handle" buttons.
  - Use the panel's existing UI helpers from `src/app/ui.tsx`.
  - `publishShared` sets `archived = 0, review = '', verified = 1` and logs activity "Publicado el chollo compartido por @handle: <title>". `rejectShared` sets `review = 'rejected'` (stays archived). Every action calls `requireEditor()` first.
  - The 4th step under "Cómo comprobamos cada cupón" has the strong text "La comunidad vota y comenta", followed by "Los votos ordenan «Más votados». El equipo lee los comentarios y retira los que avisan de un cupón que ya no funciona."
  - Do not add a nav link: `src/app/nav.tsx` belongs to the other session. Note it in the ledger as a follow-up.
- [ ] **Step 2: Run** `npm test`, eslint and `npx next build`. Expected: PASS, build succeeds.
- [ ] **Step 3: Check by hand.** Publish the deal shared in Task 6. It appears on `/` with "Compartido por @handle". Reject another and it never appears. Hide a comment and it disappears from the deal page and from the card count.
- [ ] **Step 4: Commit** `feat: moderate shared deals and comments from the panel`
