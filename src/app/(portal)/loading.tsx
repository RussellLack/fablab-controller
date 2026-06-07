/**
 * Customer-portal loading skeleton — same purpose as the (app) variant.
 */
export default function Loading() {
  return (
    <div className="animate-pulse">
      <div className="h-7 w-56 bg-line rounded mb-4" />
      <div className="h-4 w-72 bg-line rounded mb-8 opacity-60" />
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-12 bg-line rounded opacity-30" />
        ))}
      </div>
    </div>
  );
}
