/**
 * Default loading skeleton for any (app) route. Renders into the main
 * column inside the dashboard chrome (sidebar + header stay put) the
 * instant a link is clicked, so navigation feels responsive even while
 * the server resolves auth + page data.
 */
export default function Loading() {
  return (
    <div className="animate-pulse">
      <div className="h-7 w-48 bg-line rounded mb-4" />
      <div className="h-4 w-80 bg-line rounded mb-8 opacity-60" />
      <div className="grid grid-cols-4 gap-4 mb-6">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-24 bg-line rounded-lg opacity-40" />
        ))}
      </div>
      <div className="space-y-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-10 bg-line rounded opacity-30" />
        ))}
      </div>
    </div>
  );
}
