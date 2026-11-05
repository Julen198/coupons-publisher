// Single-series daily clicks: one hue, no legend (the heading names it), hover/focus tooltip per day.
const fmtDay = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString("es-ES", { day: "numeric", month: "short" });
const weekday = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString("es-ES", { weekday: "long" });

// Round the y-axis top to a readable number
function niceMax(n: number) {
  if (n <= 5) return 5;
  const p = 10 ** Math.floor(Math.log10(n));
  return Math.ceil(n / (p / 2)) * (p / 2);
}

export function DailyChart({ data }: { data: { day: string; clicks: number }[] }) {
  const max = niceMax(Math.max(0, ...data.map((d) => d.clicks)));
  const labelEvery = data.length > 14 ? 7 : 1;

  return (
    <figure className="flex flex-col gap-2">
      <div className="relative h-56 pl-10" role="img" aria-label={`Clics por día del ${fmtDay(data[0].day)} al ${fmtDay(data.at(-1)!.day)}`}>
        {/* recessive grid: top, middle, baseline */}
        {[1, 0.5, 0].map((f) => (
          <div key={f} className="pointer-events-none absolute right-0 left-10 border-t border-neutral-200 dark:border-neutral-800" style={{ bottom: `${f * 100}%` }}>
            <span className="absolute -top-2 -left-10 w-8 text-right text-[11px] tabular-nums text-neutral-500">{Math.round(max * f)}</span>
          </div>
        ))}
        <div className="absolute inset-0 left-10 flex items-end gap-[2px]">
          {data.map((d) => (
            <div key={d.day} tabIndex={0} aria-label={`${fmtDay(d.day)}: ${d.clicks} clics`} className="group relative flex h-full flex-1 items-end outline-none">
              <div
                className="w-full rounded-t-[4px] bg-blue-700 transition-opacity group-hover:opacity-80 group-focus:opacity-80 dark:bg-blue-400"
                style={{ height: `${(d.clicks / max) * 100}%`, minHeight: d.clicks ? 2 : 0 }}
              />
              <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 hidden -translate-x-1/2 rounded-md border border-neutral-200 bg-white px-2.5 py-1.5 text-xs whitespace-nowrap shadow-md group-hover:block group-focus:block dark:border-neutral-700 dark:bg-neutral-900">
                <span className="block font-semibold tabular-nums">{d.clicks} clics</span>
                <span className="text-neutral-500">{weekday(d.day)}, {fmtDay(d.day)}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="flex gap-[2px] pl-10 text-[11px] text-neutral-500" aria-hidden="true">
        {data.map((d, i) => (
          <span key={d.day} className="flex-1 overflow-visible whitespace-nowrap">{i % labelEvery === 0 ? fmtDay(d.day) : ""}</span>
        ))}
      </div>
      <table className="sr-only">
        <caption>Clics por día</caption>
        <tbody>{data.map((d) => <tr key={d.day}><th scope="row">{fmtDay(d.day)}</th><td>{d.clicks}</td></tr>)}</tbody>
      </table>
    </figure>
  );
}
