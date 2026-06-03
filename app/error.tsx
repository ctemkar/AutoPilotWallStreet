'use client';

import { useEffect } from 'react';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-brand-bg text-brand-text p-4">
      <h2 className="text-xl font-bold text-brand-red mb-4">Something went wrong!</h2>
      <button
        onClick={() => reset()}
        className="px-4 py-2 border border-brand-border text-brand-text rounded-lg hover:bg-opacity-80 transition"
      >
        Try again
      </button>
    </div>
  );
}
