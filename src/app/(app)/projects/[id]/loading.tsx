/**
 * Skeleton for in-project sub-route navigation (e.g. clicking from
 * Brief to RFQs in the module bar). Renders below the project layout's
 * breadcrumb + module bar so those stay anchored and only the
 * content area pulses.
 */
export default function Loading() {
  return (
    <div className="animate-pulse mt-4">
      <div className="h-5 w-40 bg-line rounded mb-3 opacity-60" />
      <div className="space-y-2">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="h-12 bg-line rounded opacity-30" />
        ))}
      </div>
    </div>
  );
}
