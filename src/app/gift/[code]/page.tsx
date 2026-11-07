import { Suspense } from "react";
import GiftLoader from "./GiftLoader";

export const metadata = { title: "Send a gift · Allowance" };

// The link code comes from the URL, so the page is wrapped in Suspense (required with Cache Components).
export default function GiftPage() {
  return (
    <Suspense fallback={<p className="mx-auto w-full max-w-xl px-4 py-8 text-moon-dim">Loading the gift…</p>}>
      <GiftLoader />
    </Suspense>
  );
}
