export default function NotFound() {
  return (
    <div className="min-h-screen bg-bg flex items-center justify-center px-4">
      <div className="max-w-sm w-full text-center">
        <div
          className="font-display font-black text-[120px] leading-none select-none mb-4"
          style={{ color: "var(--color-border)", WebkitTextStroke: "2px var(--color-border-strong)" }}
        >
          404
        </div>
        <h1 className="font-display text-2xl font-bold text-text-light mb-2">
          Page not found
        </h1>
        <p className="text-text-dim text-sm mb-8">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="flex items-center justify-center gap-3">
          <a href="/" className="btn btn-primary btn-sm">Go home</a>
          <a href="/admin" className="btn btn-secondary btn-sm">Admin</a>
        </div>
      </div>
    </div>
  );
}
