import Link from "next/link";

const features = [
  { icon: "🌙", title: "Allowance at midnight", body: "Weekly or monthly USDC lands in their savings while everyone sleeps.", tile: "bg-[#EDE7FF]" },
  { icon: "🎁", title: "Family abroad gifts shares", body: "Aunty's evening in London is Tobi's night in Lagos. Her gift is a slice of Apple.", tile: "bg-[#FFE6DD]" },
  { icon: "🚀", title: "Kids pitch, you approve", body: "They explain why they like a company. You say yes with Face ID at breakfast.", tile: "bg-[#DDF5E8]" },
  { icon: "☀️", title: "The Morning Report", body: "Every morning: what arrived overnight, each with a real Base receipt.", tile: "bg-[#FFF1C9]" },
];

const how = [
  ["1", "Add your kid", "Nickname, birth year, avatar and a PIN. No email, no photo."],
  ["2", "Set an allowance", "It lands at midnight from your family vault on Base."],
  ["3", "Share a gift link", "Relatives send shares from any time zone. No account needed."],
  ["4", "Wake up to it", "The Morning Report shows what arrived while they slept."],
];

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-5 pb-20 pt-6">
      <nav className="flex items-center justify-between">
        <span className="flex items-center gap-2 text-xl font-extrabold text-moon">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-star text-lg text-white shadow">🌙</span>
          Allowance
        </span>
        <div className="flex items-center gap-2 text-sm">
          <Link href="/kid" className="hidden rounded-full px-4 py-2 font-semibold text-moon-dim hover:text-moon sm:inline">
            For kids
          </Link>
          <Link href="/parent" className="rounded-full bg-white px-4 py-2 font-semibold text-moon shadow-sm">
            Parent sign in
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <section className="mt-10 grid items-center gap-10 md:grid-cols-2">
        <div>
          <span className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1 text-sm font-semibold text-star shadow-sm">
            ✨ Real stocks on Base · built for families
          </span>
          <h1 className="mt-5 text-5xl font-extrabold leading-[1.05] text-moon md:text-6xl">
            Learn to save.
            <br />
            <span className="relative inline-block">
              <span className="relative z-10 text-star">Grow while</span>
              <span className="absolute inset-x-0 bottom-1 z-0 h-4 rounded-full bg-[#FFD979]" aria-hidden />
            </span>{" "}
            you sleep.
          </h1>
          <p className="mt-5 max-w-md text-lg text-moon-dim">
            The family money app that works the night shift. Allowance lands at midnight, family abroad gifts real shares, and every morning
            your kid wakes up owning a little more.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link href="/demo" className="rounded-full bg-star px-7 py-4 text-center text-lg font-bold text-white">
              Try the 2-minute demo →
            </Link>
            <Link href="/parent" className="rounded-full border-2 border-[#E3DAFB] bg-white px-7 py-4 text-center text-lg font-bold text-moon">
              Parent setup
            </Link>
          </div>
          <p className="mt-3 text-sm text-moon-dim">No wallet or sign-up for the demo. Real Base transactions, tiny amounts paid by Allowance.</p>
        </div>

        {/* Phone mockup of a kid's dashboard */}
        <div className="relative mx-auto w-full max-w-[340px]">
          <span className="absolute -left-8 top-36 z-20 rotate-[-8deg] rounded-2xl bg-[#FFD979] px-3 py-2 text-sm font-bold text-ink shadow-lg">🎁 Gift from London!</span>
          <span className="absolute -right-4 bottom-24 z-20 rotate-[6deg] rounded-2xl bg-[#B9E9D0] px-3 py-2 text-sm font-bold text-ink shadow-lg">📈 +2.4% Apple</span>
          <div className="relative rounded-[2.6rem] border-[10px] border-ink bg-[#F8F6F0] p-4 shadow-2xl">
            <div className="mx-auto mb-3 h-1.5 w-20 rounded-full bg-ink/20" />
            <div className="flex items-center gap-2">
              <span className="grid h-10 w-10 place-items-center rounded-full bg-[#FFE6DD] text-xl">🦁</span>
              <div>
                <p className="text-xs text-moon-dim">Good morning</p>
                <p className="font-bold text-moon">Tobi</p>
              </div>
            </div>
            <div className="mt-3 rounded-2xl bg-gradient-to-br from-[#8A6DF0] to-[#6A4BE0] p-4 text-white">
              <p className="text-xs opacity-80">Total owned</p>
              <p className="text-3xl font-extrabold">$24.60</p>
              <p className="text-xs opacity-80">🍎 Apple · 🎮 Nvidia · savings</p>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <div className="rounded-2xl bg-[#DDF5E8] p-3">
                <p className="text-xs font-semibold text-[#1F6B4A]">Saving</p>
                <p className="text-lg font-extrabold text-moon">$8.00</p>
              </div>
              <div className="rounded-2xl bg-[#FFF1C9] p-3">
                <p className="text-xs font-semibold text-[#8A6A00]">Allowance</p>
                <p className="text-lg font-extrabold text-moon">$2/wk</p>
              </div>
            </div>
            <div className="mt-3 rounded-2xl bg-white p-3">
              <div className="flex justify-between text-xs font-semibold">
                <span>🎯 New bike</span>
                <span className="text-star">53%</span>
              </div>
              <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-[#EDE7FF]">
                <div className="h-full w-[53%] rounded-full bg-gradient-to-r from-[#B9E9D0] to-[#7FD6AD]" />
              </div>
            </div>
            <div className="mt-3 rounded-2xl bg-[#FFE6DD] p-3 text-xs">
              <p className="font-bold text-moon">☀️ Morning Report</p>
              <p className="text-moon-dim">Aunty Funmi sent you a slice of Apple while you slept.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Feature tiles */}
      <section className="mt-20">
        <h2 className="text-center text-3xl font-extrabold text-moon">Mornings feel like Christmas</h2>
        <p className="mx-auto mt-2 max-w-lg text-center text-moon-dim">Everything happens overnight, so there&apos;s always something new at breakfast.</p>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {features.map((f) => (
            <div key={f.title} className={`rounded-3xl p-6 ${f.tile}`}>
              <span className="text-4xl" aria-hidden>
                {f.icon}
              </span>
              <h3 className="mt-4 text-lg font-bold text-moon">{f.title}</h3>
              <p className="mt-1 text-sm text-moon-dim">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className="mt-20 rounded-[2rem] bg-white p-8 md:p-12">
        <h2 className="text-3xl font-extrabold text-moon">How it works</h2>
        <ol className="mt-8 grid gap-6 md:grid-cols-4">
          {how.map(([n, t, b]) => (
            <li key={n}>
              <span className="grid h-10 w-10 place-items-center rounded-full bg-star text-lg font-extrabold text-white">{n}</span>
              <h3 className="mt-3 font-bold text-moon">{t}</h3>
              <p className="mt-1 text-sm text-moon-dim">{b}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* Trust */}
      <section className="mt-6 grid gap-4 md:grid-cols-3">
        {[
          ["🔐", "Face ID for every yes", "Kids can only ask. Every approval needs your face or fingerprint, checked on our server."],
          ["🏦", "A vault only you own", "Caps in the contract: $5 a pitch, $20 a kid a month. Pause any time."],
          ["🧒", "Minimal child data", "Just a nickname, birth year and avatar. On-chain they're an anonymous ID."],
        ].map(([i, t, b]) => (
          <div key={t} className="rounded-3xl border-2 border-[#EDE7FF] bg-white/60 p-6">
            <span className="text-2xl" aria-hidden>
              {i}
            </span>
            <h3 className="mt-2 font-bold text-moon">{t}</h3>
            <p className="mt-1 text-sm text-moon-dim">{b}</p>
          </div>
        ))}
      </section>

      <section className="mt-16 rounded-[2rem] bg-gradient-to-br from-[#8A6DF0] to-[#6A4BE0] p-10 text-center text-white">
        <h2 className="text-3xl font-extrabold">Live a night shift in 2 minutes</h2>
        <p className="mx-auto mt-2 max-w-md opacity-90">Play Tobi, Mum and Aunty Funmi. Every step is a real transaction on Base.</p>
        <Link href="/demo" className="mt-6 inline-block rounded-full bg-white px-8 py-4 text-lg font-bold text-star">
          Start the Adeyemi demo
        </Link>
      </section>

      <footer className="mt-12 space-y-2 text-center text-xs text-moon-dim">
        <p>Kids own real Coinbase tokenized stocks on Base, held in a family vault the parent controls. Kids can only make requests.</p>
        <p>
          Coinbase tokenized stocks are only available in eligible jurisdictions outside the U.S.{" "}
          <a className="underline" href="https://www.base.org/stocks" target="_blank" rel="noreferrer">
            About the stocks
          </a>
          . Learning only, not financial advice.
        </p>
      </footer>
    </main>
  );
}
