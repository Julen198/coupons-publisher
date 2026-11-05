import { AI_FEATURES, FEATURE_INFO, usd, type AiFeature } from "@/lib/ai-costs";

// Categorical slots validated with the dataviz palette checker (light + dark); legend always shown, table below has the numbers
export const SERIES: Record<AiFeature, string> = {
  search: "bg-[#2a78d6] dark:bg-[#3987e5]",
  content: "bg-[#eb6834] dark:bg-[#d95926]",
  style: "bg-[#1baf7a] dark:bg-[#199e70]",
  stores: "bg-[#eda100] dark:bg-[#c98500]",
};

export function Swatch({ feature }: { feature: AiFeature }) {
  return <span aria-hidden="true" className={`inline-block size-2.5 shrink-0 rounded-[3px] ${SERIES[feature]}`} />;
}

const fmtDay = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString("es-ES", { day: "numeric", month: "short" });

function niceMax(n: number) {
  if (n <= 0.1) return 0.1;
  const p = 10 ** Math.floor(Math.log10(n));
  return Math.ceil(n / (p / 2)) * (p / 2);
}

type Day = { day: string } & Record<AiFeature, number>;

// Stacked daily spend by feature: first feature on the baseline, 2px gaps between segments, hover/focus tooltip per day
export function CostChart({ data }: { data: Day[] }) {
  const total = (d: Day) => AI_FEATURES.reduce((a, f) => a + d[f], 0);
  const max = niceMax(Math.max(0, ...data.map(total)));
  const labelEvery = data.length > 14 ? 6 : 1;
  return (
    <figure className="flex flex-col gap-3">
      <figcaption className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-neutral-700 dark:text-neutral-300">
        {AI_FEATURES.map((f) => <span key={f} className="flex items-center gap-1.5"><Swatch feature={f} />{FEATURE_INFO[f].label}</span>)}
      </figcaption>
      <div className="relative h-56 pl-14" role="img" aria-label={`Gasto en IA por día del ${fmtDay(data[0].day)} al ${fmtDay(data.at(-1)!.day)}`}>
        {[1, 0.5, 0].map((f) => (
          <div key={f} className="pointer-events-none absolute right-0 left-14 border-t border-neutral-200 dark:border-neutral-800" style={{ bottom: `${f * 100}%` }}>
            <span className="absolute -top-2 -left-14 w-12 text-right text-[11px] tabular-nums text-neutral-500">{usd(max * f)}</span>
          </div>
        ))}
        <div className="absolute inset-0 left-14 flex items-end gap-[2px]">
          {data.map((d, i) => {
            const t = total(d);
            const parts = AI_FEATURES.filter((f) => d[f] > 0);
            return (
              <div key={d.day} tabIndex={0} aria-label={`${fmtDay(d.day)}: ${usd(t)}`} className="group relative flex h-full flex-1 flex-col-reverse gap-[2px] outline-none">
                {parts.map((f, j) => (
                  <div
                    key={f}
                    className={`w-full transition-opacity group-hover:opacity-80 group-focus:opacity-80 ${SERIES[f]} ${j === parts.length - 1 ? "rounded-t-[4px]" : ""}`}
                    style={{ height: `${(d[f] / max) * 100}%`, minHeight: 2 }}
                  />
                ))}
                <div className={`pointer-events-none absolute top-0 z-10 hidden w-52 flex-col gap-1 rounded-md border border-neutral-200 bg-white px-3 py-2 text-xs shadow-md group-hover:flex group-focus:flex dark:border-neutral-700 dark:bg-neutral-900 ${i < data.length / 2 ? "left-full ml-2" : "right-full mr-2"}`}>
                  <span className="flex justify-between font-semibold"><span>{fmtDay(d.day)}</span><span className="tabular-nums">{usd(t, 3)}</span></span>
                  {AI_FEATURES.map((f) => (
                    <span key={f} className="flex items-center gap-2 text-neutral-600 dark:text-neutral-300"><Swatch feature={f} /><span className="flex-1">{FEATURE_INFO[f].label}</span><span className="tabular-nums">{usd(d[f], 3)}</span></span>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <div className="flex gap-[2px] pl-14 text-[11px] text-neutral-500" aria-hidden="true">
        {data.map((d, i) => <span key={d.day} className="flex-1 whitespace-nowrap">{i % labelEvery === 0 ? fmtDay(d.day) : ""}</span>)}
      </div>
    </figure>
  );
}
