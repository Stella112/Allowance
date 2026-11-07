"use client";

import dynamic from "next/dynamic";
import { useParams } from "next/navigation";
import { Suspense } from "react";

// Browser-only: uses Coinbase's wallet SDK, whose Node build must stay out of server rendering.
const GraduateApp = dynamic(() => import("./GraduateApp"), { ssr: false });

function Loader() {
  const { code } = useParams<{ code: string }>();
  return <GraduateApp code={code} />;
}

export default function GraduatePage() {
  return (
    <Suspense fallback={<p className="p-10 text-moon-dim">Loading…</p>}>
      <Loader />
    </Suspense>
  );
}
