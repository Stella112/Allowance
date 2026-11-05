import Link from "next/link";

const steps = [
  {
    icon: "🌙",
    title: "Allowance lands at midnight",
    body: "Weekly or monthly USDC drops into your kid's savings while everyone is asleep.",
  },
  {
    icon: "✈️",
    title: "Family abroad gifts real shares",
    body: "Aunty's evening in London is Tobi's night in Lagos. Her gift is a slice of Apple, not cash that gets spent.",
  },
  {
    icon: "💡",
    title: "Kids pitch, parents approve",
    body: "Your kid explains why they like a company. You approve with Face ID over breakfast.",
  },
  {
    icon: "☀️",
    title: "The Morning Report",
    body: "Every morning: what arrived overnight, with a link to each real transaction on Base.",
  },
];

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col px-4 pb-16 pt-10">
      <p className="text-sm font-semibold tracking-wide text-star">Allowance</p>
      <h1 className="mt-3 text-4xl font-bold leading-tight text-moon">
        The family money app that works the night shift.
      </h1>
      <p className="mt-4 text-lg text-moon-dim">
        While kids sleep, their allowance lands, relatives abroad gift real shares, and every
        morning they wake up owning a little more.
      </p>

      <div className="mt-8 flex flex-col gap-3">
        <Link
          href="/demo"
          className="rounded-2xl bg-star px-6 py-4 text-center text-lg font-semibold text-night-950 hover:bg-sunrise-300"
        >
          Try the Adeyemi family demo
        </Link>
        <p className="text-center text-sm text-moon-dim">
          No wallet, no sign-up, about 2 minutes. Demo family, real Base transactions, tiny amounts
          paid by Allowance.
        </p>
        <Link
          href="/signup"
          className="rounded-2xl border border-night-700 px-6 py-3 text-center font-medium text-moon hover:bg-night-800"
        >
          Sign up as a parent
        </Link>
      </div>

      <ol className="mt-12 flex flex-col gap-4">
        {steps.map((s) => (
          <li key={s.title} className="flex gap-4 rounded-2xl bg-night-900 p-5">
            <span aria-hidden className="text-3xl">
              {s.icon}
            </span>
            <div>
              <h2 className="font-semibold text-moon">{s.title}</h2>
              <p className="mt-1 text-moon-dim">{s.body}</p>
            </div>
          </li>
        ))}
      </ol>

      <footer className="mt-12 space-y-2 text-xs text-moon-dim">
        <p>
          Kids own real Coinbase tokenized stocks on Base, held in a family vault the parent
          controls. Kids can only make requests; they can never move money.
        </p>
        <p>
          Coinbase tokenized stocks are only available to persons in eligible jurisdictions outside
          the U.S.{" "}
          <a className="underline" href="https://www.base.org/stocks" target="_blank" rel="noreferrer">
            About the stocks
          </a>
          . Learning only, not financial advice.
        </p>
      </footer>
    </main>
  );
}
