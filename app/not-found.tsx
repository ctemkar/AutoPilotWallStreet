import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-brand-bg text-brand-text p-4">
      <h2 className="text-xl font-bold mb-4">Page Not Found</h2>
      <Link
        href="/"
        className="px-4 py-2 border border-brand-border text-brand-text rounded-lg hover:bg-opacity-80 transition"
      >
        Return Home
      </Link>
    </div>
  );
}
