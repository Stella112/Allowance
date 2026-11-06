"use client";

import dynamic from "next/dynamic";

// Renders in the browser only: the bedtime theme follows the device clock, not the server's.
const KidApp = dynamic(() => import("./KidApp"), {
  ssr: false,
  loading: () => <p className="mx-auto w-full max-w-xl px-4 py-8 opacity-70">Loading…</p>,
});

export default function KidLoader() {
  return <KidApp />;
}
