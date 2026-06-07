"use client";
export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="min-h-screen bg-bg flex items-center justify-center px-4">
      <div className="max-w-sm w-full text-center">
        <h1 className="font-display text-2xl font-bold text-text-light mb-3">
          Something went wrong
        </h1>
        <p className="text-text-dim text-sm mb-6">
          {error.message || "An unexpected error occurred."}
        </p>
        <div className="flex items-center justify-center gap-3">
          <button
            onClick={reset}
            className="inline-flex items-center gap-2 bg-primary text-white rounded-lg px-4 py-2 text-sm font-semibold hover:bg-primary/90 transition-colors"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center gap-2 border border-border text-text-light rounded-lg px-4 py-2 text-sm font-semibold hover:bg-bg-hover transition-colors"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}
