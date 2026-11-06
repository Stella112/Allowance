"use client";

import dynamic from "next/dynamic";

// The parent app is fully interactive and uses Coinbase's wallet SDK, so it renders in the browser only.
// (Rendering it on the server would load the SDK's Node build, which pulls in server-only code.)
const ParentApp = dynamic(() => import("./ParentApp"), {
  ssr: false,
  loading: () => <p className="mx-auto w-full max-w-xl px-4 py-8 text-moon-dim">Loading…</p>,
});

export default function ParentLoader() {
  return <ParentApp />;
}
