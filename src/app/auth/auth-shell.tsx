import type { ReactNode } from "react";

// Login and invite share this split screen: a brand panel (from md up) and the form.
// On phones the panel would push the form below the fold, so it becomes a compact top bar.

const WORDS: Record<number, string> = { 3: "15%", 9: "10€", 15: "2×1", 20: "-30%", 26: "5€", 31: "50%", 37: "ENVÍO", 44: "20%", 50: "3×2", 57: "12€" };
const TONES = ["#1e3a8a", "#1d4ed8", "#2563eb", "#172554", "#1e40af", "#3b82f6"];
// every coupon a tile, every media site its mosaic
const TILES = Array.from({ length: 63 }, (_, i) => ({
  text: WORDS[i] ?? "",
  background: WORDS[i] ? "#2563eb" : TONES[(i * 7 + (i % 5) * 3) % TONES.length],
  opacity: WORDS[i] ? 1 : 0.28 + ((i * 37) % 50) / 100,
}));

const POINTS = ["El estilo de cada medio, leído de su web con IA", "Cupones verificados y al día, sin exportar nada", "Cada clic atribuido al medio que lo genera"];

function Logo({ size = 40 }: { size?: number }) {
  return (
    <span className="flex shrink-0 items-center justify-center rounded-[10px] bg-blue-700" style={{ width: size, height: size }}>
      <svg width={size * 0.6} height={size * 0.6} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M3 8a2 2 0 0 0 2-2h14a2 2 0 0 0 2 2v2a2 2 0 0 0 0 4v2a2 2 0 0 0-2 2H5a2 2 0 0 0-2-2v-2a2 2 0 0 0 0-4z" />
        <path d="M10 9l4 6" />
      </svg>
    </span>
  );
}

export function AuthShell({ headline, children }: { headline: string; children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-white text-neutral-900 md:flex-row dark:bg-neutral-950 dark:text-neutral-100">
      {/* phones: compact brand bar */}
      <header className="flex items-center gap-2.5 bg-[#0b1f5c] px-5 py-4 text-indigo-50 md:hidden dark:bg-[#0b1430]">
        <Logo size={32} />
        <span className="font-bold tracking-tight">CuponLab</span>
      </header>

      <aside aria-label="CuponLab" className="relative hidden flex-1 flex-col justify-between overflow-hidden bg-[#0b1f5c] px-10 py-12 text-indigo-50 md:flex lg:px-14 dark:bg-[#0b1430]">
        <div aria-hidden="true" className="absolute -top-3 -right-10 grid w-[520px] origin-top-right -rotate-8 grid-cols-7 gap-2">
          {TILES.map((t, i) => (
            <span
              key={i}
              className={`flex aspect-square items-center justify-center rounded-lg text-[15px] font-bold tracking-tight text-white ${t.text ? "ring-1 ring-white/25 ring-inset" : ""}`}
              style={{ background: t.background, opacity: t.opacity }}
            >
              {t.text}
            </span>
          ))}
        </div>
        <div aria-hidden="true" className="absolute inset-0 bg-linear-to-r from-[#0b1f5c] from-40% to-transparent dark:from-[#0b1430]" />

        <div className="relative flex items-center gap-3">
          <Logo />
          <span className="text-lg font-bold tracking-tight">CuponLab</span>
        </div>
        <div className="relative flex max-w-md flex-col gap-5">
          <h2 className="text-3xl leading-tight font-bold tracking-tight lg:text-4xl">{headline}</h2>
          <p className="text-base leading-relaxed text-indigo-200">Páginas de cupones de afiliación para medios y tiendas, con su estilo y siempre al día.</p>
          <ul className="flex flex-col gap-2.5 text-sm">
            {POINTS.map((p) => (
              <li key={p} className="flex items-start gap-2.5"><span aria-hidden="true" className="mt-1.5 size-2 shrink-0 rounded-[2px] bg-blue-400" />{p}</li>
            ))}
          </ul>
        </div>
        <span className="relative text-xs text-indigo-300">© CuponLab</span>
      </aside>

      <main className="flex flex-1 items-start justify-center px-5 py-10 sm:items-center sm:px-8 md:py-12">
        <div className="w-full max-w-[400px]">{children}</div>
      </main>
    </div>
  );
}
