import Link from "next/link";

export const metadata = { title: "Sign up · Allowance" };

export default function SignupPage() {
  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center gap-4 px-4 py-10">
      <p className="text-5xl" aria-hidden>
        🌙
      </p>
      <h1 className="text-3xl font-bold">Parent sign-up is coming soon</h1>
      <p className="text-moon-dim">
        We&apos;re starting with pilot families in Lagos with relatives in the UK and US. Real accounts will use email sign-in, Face ID approvals and a family vault on
        Base that you own.
      </p>
      <Link href="/demo" className="rounded-2xl bg-star px-6 py-4 text-center text-lg font-semibold text-night-950">
        Try the Adeyemi family demo meanwhile
      </Link>
    </main>
  );
}
