export default function Loading() {
  return (
    <div className="page-container">
      {/* Header skeleton */}
      <div className="flex items-center justify-between mb-6">
        <div className="space-y-2">
          <div className="skeleton h-7 w-36 rounded-lg" />
          <div className="skeleton h-4 w-24 rounded" />
        </div>
        <div className="skeleton h-8 w-28 rounded-lg" />
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="stat-card space-y-3">
            <div className="skeleton h-9 w-9 rounded-xl" />
            <div className="skeleton h-8 w-16 rounded" />
            <div className="skeleton h-4 w-20 rounded" />
            <div className="skeleton h-3 w-24 rounded" />
          </div>
        ))}
      </div>

      {/* Content skeleton */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 card overflow-hidden">
          <div className="px-5 py-4 border-b border-border">
            <div className="skeleton h-5 w-36 rounded" />
          </div>
          <div className="divide-y divide-border">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="px-5 py-3.5 flex items-center justify-between gap-4">
                <div className="space-y-2 flex-1">
                  <div className="skeleton h-4 w-40 rounded" />
                  <div className="skeleton h-3 w-28 rounded" />
                </div>
                <div className="skeleton h-5 w-16 rounded-full" />
              </div>
            ))}
          </div>
        </div>
        <div className="card overflow-hidden">
          <div className="px-5 py-4 border-b border-border">
            <div className="skeleton h-5 w-28 rounded" />
          </div>
          <div className="divide-y divide-border">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="px-5 py-3.5 space-y-2">
                <div className="skeleton h-4 w-32 rounded" />
                <div className="skeleton h-3 w-24 rounded" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
