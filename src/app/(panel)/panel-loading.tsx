// Skeleton shown instantly while a panel page reads the database (re-exported as each route's loading.tsx)
export default function PanelLoading() {
  return (
    <div className="flex animate-pulse flex-col gap-6" aria-busy="true" aria-label="Cargando">
      <div className="flex flex-col gap-2">
        <div className="h-3 w-32 rounded bg-neutral-200 dark:bg-neutral-800" />
        <div className="h-7 w-48 rounded bg-neutral-200 dark:bg-neutral-800" />
      </div>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-4">
        {[0, 1, 2, 3].map((i) => <div key={i} className="h-24 rounded-lg bg-neutral-100 dark:bg-neutral-900" />)}
      </div>
      <div className="h-80 rounded-lg bg-neutral-100 dark:bg-neutral-900" />
    </div>
  );
}
