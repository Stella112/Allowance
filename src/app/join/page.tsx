"use client";

import dynamic from "next/dynamic";
import { Suspense } from "react";

// Browser-only (device cookie + polling); Suspense because it reads ?code= from the URL.
const JoinApp = dynamic(() => import("./JoinApp"), { ssr: false });

export default function JoinPage() {
  return (
    <Suspense fallback={<p className="p-10 text-moon-dim">Loading…</p>}>
      <JoinApp />
    </Suspense>
  );
}
