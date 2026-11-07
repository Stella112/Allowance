import Link from "next/link";

/* Small UI pieces drawn in HTML so the page shows the real product, not stock art. */
function Phone({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative mx-auto w-[300px] rounded-[2.8rem] border-[10px] border-ink bg-[#F8F6F0] p-4 shadow-2xl">
      <div className="mx-auto mb-4 h-1.5 w-20 rounded-full bg-ink/20" />
      {children}
    </div>
  );
}
const Sticker = ({ className, children }: { className: string; children: React.ReactNode }) => (
  <span className={`absolute z-20 rounded-2xl px-3 py-2 text-sm font-extrabold text-ink shadow-lg ${className}`}>{children}</span>
);

const story = [
  {
    tag: "🌙 Midnight",
    title: "Allowance lands while they sleep.",
    body: "Set a weekly or monthly amount once. At local midnight it moves from your family vault into their savings on Base. No one has to remember.",
    tile: "bg-[#EDE7FF]",
    ui: (
      <div className="rounded-3xl bg-white p-5 shadow">
        <p className="text-xs font-bold text-moon-dim">12:00 AM · Lagos</p>
        <p className="mt-2 text-lg font-extrabold">🌙 Allowance landed</p>
        <p className="text-3xl font-extrabold text-star">+$2.00</p>
        <p className="mt-1 text-xs text-moon-dim">Tobi&apos;s savings · see it on Basescan ↗</p>
      </div>
    ),
  },
  {
    tag: "🚀 Bedtime pitch",
    title: "Kids pitch a company. A coach asks one question.",
    body: "They pick Apple or Nvidia, read a card written for their age, and explain why. Before it reaches you, the coach asks “What could go wrong?” Every investment is a lesson.",
    tile: "bg-[#FFE6DD]",
    ui: (
      <div className="flex flex-col gap-2">
        <p className="self-end rounded-2xl rounded-br-sm bg-star px-4 py-2 text-sm font-semibold text-white">Everyone at school wants AirPods 🎧</p>
        <p className="self-start rounded-2xl rounded-bl-sm bg-white px-4 py-2 text-sm shadow">🧑‍🏫 What else does Apple sell?</p>
        <p className="self-end rounded-2xl rounded-br-sm bg-star px-4 py-2 text-sm font-semibold text-white">iPhones, Macs and apps!</p>
        <p className="self-center rounded-full bg-[#FFF1C9] px-3 py-1 text-xs font-bold">🌙 Mum will see this in the morning</p>
      </div>
    ),
  },
  {
    tag: "🔐 Breakfast",
    title: "You approve with Face ID. Real shares are bought.",
    body: "Pitches wait for you at breakfast. One tap and Face ID, checked on our server, so a kid up late on your phone can't approve their own. Match 50% to cheer them on.",
    tile: "bg-[#DDF5E8]",
    ui: (
      <div className="rounded-3xl bg-white p-5 shadow">
        <p className="font-extrabold">🦁 Tobi wants $5 of 🍎 Apple</p>
        <p className="mt-1 text-sm text-moon-dim">“Everyone at school wants AirPods.”</p>
        <div className="mt-3 grid grid-cols-4 gap-1 text-xs font-bold">
          {["0%", "25%", "50%", "100%"].map((m) => (
            <span key={m} className={`rounded-lg py-1 text-center ${m === "50%" ? "bg-star text-white" : "bg-[#EDE7FF]"}`}>
              {m}
            </span>
          ))}
        </div>
        <p className="mt-3 rounded-xl bg-ink py-2 text-center text-sm font-bold text-white">🔐 Approve with Face ID</p>
      </div>
    ),
  },
  {
    tag: "✈️ Family abroad",
    title: "Relatives gift shares from any time zone.",
    body: "Share a link on WhatsApp. Aunty in London opens it after work, picks a company and pays in USDC from her own wallet. Cousins can chip in on a group gift.",
    tile: "bg-[#FFF1C9]",
    ui: (
      <div className="rounded-3xl bg-white p-5 shadow">
        <div className="grid grid-cols-2 gap-2 text-center">
          <div className="rounded-2xl bg-[#EDE7FF] p-3">
            <p className="text-xs font-bold">London</p>
            <p className="text-xl font-extrabold">8:30 PM</p>
          </div>
          <div className="rounded-2xl bg-ink p-3 text-white">
            <p className="text-xs font-bold">Lagos 🌙</p>
            <p className="text-xl font-extrabold">9:30 PM</p>
          </div>
        </div>
        <p className="mt-3 text-sm">Tobi will wake up to your gift.</p>
        <p className="mt-2 rounded-xl bg-star py-2 text-center text-sm font-bold text-white">🎁 Send $5 of Apple</p>
      </div>
    ),
  },
  {
    tag: "☀️ Morning",
    title: "They wake up to a Morning Report.",
    body: "What arrived, what was approved, how their companies did, and real dividends. Every line links to the real transaction. They send a voice thank-you back across the world.",
    tile: "bg-[#FFE6DD]",
    ui: (
      <div className="rounded-3xl bg-gradient-to-b from-[#FFB9A8] to-[#FFE6DD] p-5 shadow">
        <p className="text-xs font-extrabold uppercase">Good morning, Tobi ☀️</p>
        <p className="mt-2 rounded-2xl bg-white p-3 text-sm font-semibold">🎁 Aunty Funmi sent you a slice of Apple</p>
        <p className="mt-2 rounded-2xl bg-white p-3 text-sm font-semibold">✅ Mum approved your pitch · matched 50%</p>
        <p className="mt-2 rounded-2xl bg-white p-3 text-sm font-semibold">📈 Your Nvidia pick: up 2.4%</p>
        <p className="mt-2 rounded-2xl bg-white p-3 text-sm font-semibold">🎙️ Send a thank-you to London</p>
      </div>
    ),
  },
  {
    tag: "🎓 At 18",
    title: "Graduation: their shares, their wallet.",
    body: "When they turn 18 they sign up with their own email. You approve, and every share moves to their own wallet, with their whole history from childhood.",
    tile: "bg-[#EDE7FF]",
    ui: (
      <div className="rounded-3xl bg-white p-5 text-center shadow">
        <p className="text-5xl" aria-hidden>
          🎓
        </p>
        <p className="mt-2 font-extrabold">Tobi graduated!</p>
        <p className="text-sm text-moon-dim">🍎 Apple · 🎮 Nvidia → Tobi&apos;s own wallet</p>
      </div>
    ),
  },
];

const faq = [
  ["Are these real stocks?", "Yes. Kids own Coinbase tokenized Apple and Nvidia shares on Base, backed 1:1 by real shares and bought through Aerodrome. Every purchase has a Basescan link."],
  ["Can my kid spend or move money?", "No. Kids can only ask. Every purchase needs your Face ID, and the family vault only lets you (or Allowance's helper, inside your limits) move money."],
  ["What does it cost?", "No fees in the MVP. You pay small network fees on Base, a few cents. The demo is free: Allowance pays its tiny transactions."],
  ["Who can use it?", "Coinbase tokenized stocks are for eligible jurisdictions outside the U.S. We're starting with families in Lagos and relatives in the UK and US."],
  ["What data do you keep about my child?", "Only a nickname, birth year, avatar and a scrambled PIN, plus when you gave consent. No email, phone, photo, school or surname. On Base they're an anonymous ID."],
];

export default function Home() {
  return (
    <div className="flex-1 overflow-x-hidden bg-[radial-gradient(1200px_600px_at_50%_-10%,#FFE9A8_0%,rgba(255,233,168,0)_60%)]">
      <main className="mx-auto flex w-full max-w-6xl flex-col px-5 pb-16 pt-6">
        <nav className="flex items-center justify-between">
          <span className="flex items-center gap-2 text-xl font-extrabold text-moon">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-star text-lg text-white shadow">🌙</span>
            Allowance
          </span>
          <div className="flex items-center gap-1 text-sm font-bold">
            <a href="#how" className="hidden rounded-full px-3 py-2 text-moon-dim hover:text-moon sm:inline">
              How it works
            </a>
            <a href="#safety" className="hidden rounded-full px-3 py-2 text-moon-dim hover:text-moon sm:inline">
              Safety
            </a>
            <a href="#faq" className="hidden rounded-full px-3 py-2 text-moon-dim hover:text-moon sm:inline">
              FAQ
            </a>
            <Link href="/parent" className="rounded-full bg-ink px-4 py-2 text-white">
              Sign in
            </Link>
          </div>
        </nav>

        {/* Hero: Locket-style, centred */}
        <section className="mt-12 text-center">
          <span className="inline-block rotate-[-3deg] rounded-xl bg-ink px-3 py-1 text-sm font-extrabold uppercase tracking-wide text-[#FFD979]">
            The night shift
          </span>
          <h1 className="mx-auto mt-5 max-w-3xl text-5xl font-extrabold leading-[1.05] text-moon md:text-7xl">
            Kids wake up owning <span className="text-star">a little more.</span>
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-lg text-moon-dim">
            Allowance lands at midnight. Family abroad gifts real shares. Kids pitch companies and you approve with Face ID. Real stocks, on Base.
          </p>
          <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
            <Link href="/demo" className="rounded-full bg-star px-8 py-4 text-lg font-extrabold text-white">
              Try the 2-minute demo
            </Link>
            <Link href="/parent" className="rounded-full bg-white px-8 py-4 text-lg font-extrabold text-moon shadow">
              Set up your family
            </Link>
          </div>
          <p className="mt-3 text-sm text-moon-dim">No wallet or sign-up for the demo. Real Base transactions, tiny amounts paid by us.</p>

          <div className="relative mx-auto mt-14 w-fit">
            <Sticker className="-left-28 top-16 rotate-[-10deg] bg-[#FFD979]">🌙 while they sleep</Sticker>
            <Sticker className="-right-28 top-40 rotate-[8deg] bg-[#B9E9D0]">📈 real stocks</Sticker>
            <Sticker className="-left-24 bottom-24 rotate-[6deg] bg-[#FFB9A8]">🎁 from London</Sticker>
            <Sticker className="-right-20 bottom-10 rotate-[-6deg] bg-white">🔐 Face ID</Sticker>
            <Phone>
              <div className="grid grid-cols-4 gap-3">
                {["📷", "💬", "🎵", "🗺️", "📚", "🎮", "⚽", "🧮"].map((i) => (
                  <span key={i} className="grid aspect-square place-items-center rounded-2xl bg-white text-xl shadow-sm">
                    {i}
                  </span>
                ))}
              </div>
              <div className="mt-4 rounded-3xl bg-gradient-to-br from-[#8A6DF0] to-[#6A4BE0] p-4 text-left text-white">
                <p className="text-xs font-bold opacity-80">ALLOWANCE · this morning</p>
                <p className="mt-1 text-lg font-extrabold leading-snug">🎁 Aunty Funmi sent you a slice of Apple</p>
                <div className="mt-3 flex gap-2 text-xs font-bold">
                  <span className="rounded-full bg-white/20 px-2 py-1">🌙 +$2.00</span>
                  <span className="rounded-full bg-white/20 px-2 py-1">📈 +2.4%</span>
                </div>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-3">
                <div className="rounded-3xl bg-[#DDF5E8] p-3 text-left">
                  <p className="text-xs font-bold text-[#1F6B4A]">Savings</p>
                  <p className="text-xl font-extrabold">$8.00</p>
                </div>
                <div className="rounded-3xl bg-[#FFF1C9] p-3 text-left">
                  <p className="text-xs font-bold text-[#8A6A00]">🎯 Bike</p>
                  <p className="text-xl font-extrabold">53%</p>
                </div>
              </div>
            </Phone>
          </div>
        </section>

        {/* Problem */}
        <section className="mt-24 grid gap-4 md:grid-cols-2">
          <div className="rounded-[2rem] bg-white p-8">
            <p className="text-sm font-extrabold uppercase text-sunrise-700">The problem</p>
            <h2 className="mt-2 text-3xl font-extrabold">Money sent home gets spent.</h2>
            <p className="mt-3 text-moon-dim">
              Billions travel to families every year, usually overnight, as cash. Kids in the US have Greenlight and Acorns. Kids in Lagos don&apos;t, even though
              they can now own real US stocks on Base.
            </p>
          </div>
          <div className="rounded-[2rem] bg-ink p-8 text-white">
            <p className="text-sm font-extrabold uppercase text-[#FFD979]">Allowance</p>
            <h2 className="mt-2 text-3xl font-extrabold">Turn it into shares that grow.</h2>
            <p className="mt-3 opacity-80">
              Allowance, gifts and pitches all become real shares, held in a family vault you own and tracked per kid. Every morning there&apos;s something new.
            </p>
          </div>
        </section>

        {/* Story, Sundrop-style alternating sections */}
        <section id="how" className="mt-24 flex flex-col gap-6">
          <h2 className="text-center text-4xl font-extrabold">How a night shift works</h2>
          {story.map((s, i) => (
            <div key={s.title} className={`grid items-center gap-8 rounded-[2rem] p-8 md:grid-cols-2 md:p-12 ${s.tile}`}>
              <div className={i % 2 ? "md:order-2" : ""}>
                <span className="rounded-full bg-white px-3 py-1 text-sm font-extrabold">{s.tag}</span>
                <h3 className="mt-4 text-3xl font-extrabold leading-tight">{s.title}</h3>
                <p className="mt-3 text-moon-dim">{s.body}</p>
              </div>
              <div className="mx-auto w-full max-w-sm">{s.ui}</div>
            </div>
          ))}
        </section>

        {/* Safety */}
        <section id="safety" className="mt-24 rounded-[2rem] bg-white p-8 md:p-12">
          <h2 className="text-4xl font-extrabold">Safe by design</h2>
          <p className="mt-2 text-moon-dim">Built for kids first, with grown-up controls.</p>
          <div className="mt-8 grid gap-6 md:grid-cols-4">
            {[
              ["🙋", "Kids can only ask", "No kid can move money, approve or change settings, in the app or the contract."],
              ["🔐", "Face ID for every yes", "Approvals use your passkey, checked on our server, never just a tap."],
              ["🏦", "Caps in the contract", "$5 a purchase, $20 a kid a month, $100 per vault. Pause any time."],
              ["🧒", "Minimal child data", "Nickname, birth year, avatar. On Base they're an anonymous ID."],
            ].map(([i, t, b]) => (
              <div key={t}>
                <span className="grid h-12 w-12 place-items-center rounded-2xl bg-[#EDE7FF] text-2xl">{i}</span>
                <h3 className="mt-3 font-extrabold">{t}</h3>
                <p className="mt-1 text-sm text-moon-dim">{b}</p>
              </div>
            ))}
          </div>
        </section>

        {/* FAQ */}
        <section id="faq" className="mx-auto mt-24 w-full max-w-3xl">
          <h2 className="text-center text-4xl font-extrabold">Questions parents ask</h2>
          <div className="mt-8 flex flex-col gap-3">
            {faq.map(([q, a]) => (
              <details key={q} className="group rounded-3xl bg-white p-5 open:shadow">
                <summary className="flex cursor-pointer list-none items-center justify-between font-extrabold">
                  {q}
                  <span className="text-star transition group-open:rotate-45">＋</span>
                </summary>
                <p className="mt-3 text-moon-dim">{a}</p>
              </details>
            ))}
          </div>
        </section>

        {/* Final CTA */}
        <section className="mt-24 rounded-[2rem] bg-gradient-to-br from-[#8A6DF0] to-[#6A4BE0] p-12 text-center text-white">
          <p className="text-4xl" aria-hidden>
            🌙 🎁 ☀️
          </p>
          <h2 className="mt-4 text-4xl font-extrabold">Live a night shift in 2 minutes.</h2>
          <p className="mx-auto mt-2 max-w-md opacity-90">Play Tobi, Mum and Aunty Funmi. Every step is a real transaction on Base.</p>
          <Link href="/demo" className="mt-6 inline-block rounded-full bg-white px-8 py-4 text-lg font-extrabold text-star">
            Start the Adeyemi demo
          </Link>
        </section>

        <footer className="mt-12 flex flex-col items-center gap-2 text-center text-xs text-moon-dim">
          <div className="flex gap-4 text-sm font-bold">
            <Link href="/demo">Demo</Link>
            <Link href="/parent">Parents</Link>
            <Link href="/kid">Kids</Link>
            <a href="https://github.com/Stella112/Allowance" target="_blank" rel="noreferrer">
              GitHub
            </a>
          </div>
          <p>Built on Base for Vibeathon 02. Coinbase tokenized stocks are available in eligible jurisdictions outside the U.S. Learning only, not financial advice.</p>
        </footer>
      </main>
    </div>
  );
}
