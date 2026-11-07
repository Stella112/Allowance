"use client";

import dynamic from "next/dynamic";
import { useParams } from "next/navigation";

// Renders in the browser only: it talks to the relative's own wallet and shows their local time.
const GiftApp = dynamic(() => import("./GiftApp"), {
  ssr: false,
  loading: () => <p className="mx-auto w-full max-w-xl px-4 py-8 text-moon-dim">Loading the gift…</p>,
});

export default function GiftLoader() {
  const { code } = useParams<{ code: string }>();
  return <GiftApp code={code} />;
}
