import Link from "next/link";
import NightScene from "@/components/NightScene";

/* Hero composition: a tilted phone showing the product, with stickers and notes scattered around it. */

const Logo = ({ size = "sm" }: { size?: "sm" | "lg" }) => (
  <span className={`flex items-center font-extrabold tracking-tight text-moon ${size === "lg" ? "gap-3 text-5xl md:text-7xl" : "gap-2.5 text-2xl"}`}>
    <span className={`grid place-items-center bg-sunny ${size === "lg" ? "h-14 w-14 rounded-[18px] text-3xl md:h-20 md:w-20" : "h-10 w-10 rounded-xl text-xl"}`} aria-hidden>
      🌙
    </span>
    Allowance
  </span>
);

const Float = ({ className, children }: { className: string; children: React.ReactNode }) => (
  <div className={`sway absolute z-20 ${className}`} aria-hidden>
    {children}
  </div>
);

const Note = ({ icon, title, sub }: { icon: string; title: string; sub: string }) => (
  <div className="flex items-center gap-2 rounded-2xl bg-white p-2.5 pr-4 shadow-lg">
    <span className="grid h-10 w-10 place-items-center rounded-xl bg-night-800 text-xl">{icon}</span>
    <span className="text-left leading-tight">
      <span className="block text-sm font-extrabold">{title}</span>
      <span className="block text-xs font-semibold text-moon-dim">{sub}</span>
    </span>
  </div>
);

const AppIcon = ({ bg, children }: { bg: string; children: React.ReactNode }) => <span className={`grid aspect-square place-items-center rounded-[22%] text-xl ${bg}`}>{children}</span>;

function Phone() {
  return (
    <div className="float-slow mx-auto w-[250px] rotate-[6deg] rounded-[44px] bg-gradient-to-b from-[#DCE6F2] to-[#F4EFE6] p-5 shadow-2xl md:w-[310px]">
      <div className="flex items-center justify-between px-1 text-xs font-bold text-white">
        <span>9:41</span>
        <span className="h-2.5 w-6 rounded-sm bg-white/90" />
      </div>
      <div className="mt-5 grid grid-cols-4 gap-3">
        <div className="col-span-2 row-span-2 flex flex-col justify-between rounded-[22px] bg-lavender p-3 text-left text-ink">
          <p className="text-[10px] font-extrabold opacity-70">Tobi&apos;s morning</p>
          <div>
            <p className="text-2xl" aria-hidden>
              🍎
            </p>
            <p className="text-xs font-extrabold leading-tight">Aunty Funmi sent you a slice of Apple</p>
          </div>
        </div>
        <AppIcon bg="bg-sunny">🌙</AppIcon>
        <AppIcon bg="bg-white">📚</AppIcon>
        <AppIcon bg="bg-[#DDF5E8]">📈</AppIcon>
        <AppIcon bg="bg-[#FFE6DD]">🎁</AppIcon>
        <AppIcon bg="bg-white">🎧</AppIcon>
        <AppIcon bg="bg-lime">⚽</AppIcon>
        <AppIcon bg="bg-[#E3F0FF]">✉️</AppIcon>
        <AppIcon bg="bg-white">🎨</AppIcon>
        <AppIcon bg="bg-[#FFE6DD]">🎵</AppIcon>
        <AppIcon bg="bg-white">📷</AppIcon>
        <AppIcon bg="bg-[#E3F0FF]">🌤️</AppIcon>
        <AppIcon bg="bg-lime">🗓️</AppIcon>
      </div>
      <div className="mt-5 h-16" />
    </div>
  );
}

const story = [
  { sticker: "🌙", title: "Allowance at midnight", body: "Set a weekly or monthly amount once. It lands in their savings on Base while everyone sleeps." },
  { sticker: "🚀", title: "Bedtime pitches", body: "Kids pick Apple or Nvidia, read a card written for their age, and answer one question from a coach." },
  { sticker: "🔐", title: "Approve at breakfast", body: "One tap and Face ID, checked on our server. Real shares are bought, and you can match 50% to cheer them on." },
  { sticker: "✈️", title: "Gifts from any time zone", body: "Share a link on WhatsApp. Aunty in London pays in USDC from her own wallet, and cousins can chip in together." },
  { sticker: "☀️", title: "The Morning Report", body: "What arrived, what was approved and how their companies did, with a real transaction behind every line." },
  { sticker: "🎓", title: "Graduation at 18", body: "They sign up with their own email, and every share moves to their own wallet, history included." },
];

const safety = [
  ["🙋", "Kids can only ask", "No kid can move money, approve or change settings, in the app or the contract."],
  ["🛡️", "Caps in the contract", "$5 a purchase, $20 a kid a month, $100 per vault. Pause any time."],
  ["🧸", "Minimal child data", "Nickname, birth year, avatar. On Base they're an anonymous ID."],
];

const faq = [
  ["Are these real stocks?", "Yes. Kids own Coinbase tokenized Apple and Nvidia shares on Base, backed 1:1 by real shares and bought through Aerodrome. Every purchase has a Basescan link."],
  ["Can my kid spend or move money?", "No. Kids can only ask. Every purchase needs your Face ID, and the family vault only lets you (or Allowance's helper, inside your limits) move money."],
  ["What does it cost?", "No fees in the MVP. Network fees on Base are a few cents. The demo is free: Allowance pays its tiny transactions."],
  ["Who can use it?", "Coinbase tokenized stocks are for eligible jurisdictions outside the U.S. We're starting with families in Lagos and relatives in the UK and US."],
  ["What data do you keep about my child?", "Only a nickname, birth year, avatar and a scrambled PIN, plus when you gave consent. No email, phone, photo, school or surname. On Base they're an anonymous ID."],
];

export default function Home() {
  return (
    <div className="flex-1 overflow-x-hidden bg-[linear-gradient(180deg,#FFE7A6_0%,#FFF3CF_34rem,#FFFBF1_52rem)]">
      <div className="mx-auto flex w-full max-w-5xl flex-col px-5 pb-10 pt-5">
        <nav className="flex items-center justify-between">
          <Logo />
          <div className="flex items-center gap-1 text-sm font-extrabold">
            <a href="#how" className="hidden rounded-full px-3 py-2 sm:inline">
              How it works
            </a>
            <a href="#safety" className="hidden rounded-full px-3 py-2 sm:inline">
              Safety
            </a>
            <a href="#faq" className="hidden rounded-full px-3 py-2 sm:inline">
              FAQ
            </a>
            <Link href="/parent" className="btn btn-sm">
              Sign in
            </Link>
          </div>
        </nav>

        <main className="flex flex-col">
          {/* Hero */}
          <section className="text-center">
            <div className="relative mx-auto mt-6 h-[430px] w-full max-w-4xl md:h-[520px]">
              <div className="absolute inset-x-0 top-2">
                <Phone />
              </div>

              <Float className="left-0 top-4 md:left-16 md:top-6">
                <span className="die-cut block rotate-[-10deg] text-5xl md:text-6xl">🌙</span>
              </Float>
              <Float className="right-0 top-0 md:right-24 md:top-10">
                <span className="die-cut block rotate-[10deg] text-5xl md:text-6xl">🎁</span>
              </Float>
              <Float className="-left-1 top-44 md:left-0 md:top-48">
                <span className="block rotate-[-8deg] rounded-2xl bg-ink px-3 py-2 text-xs font-extrabold uppercase leading-tight tracking-wide text-sunny shadow-lg md:text-sm">
                  The
                  <br />
                  night shift
                </span>
              </Float>
              <Float className="right-0 top-[11.5rem] md:right-2 md:top-40">
                <span className="die-cut block rotate-[12deg] text-5xl md:text-6xl">🍎</span>
              </Float>
              <Float className="hidden md:left-12 md:top-[23rem] md:block">
                <Note icon="🌙" title="Allowance landed" sub="12:00 AM · +$2.00" />
              </Float>
              <Float className="hidden md:right-16 md:top-[19rem] md:block">
                <span className="die-cut block rotate-[-8deg] text-6xl">📈</span>
              </Float>
              <Float className="bottom-2 left-1/2 ml-2 md:ml-16">
                <div className="rotate-[-4deg]">
                  <Note icon="🎁" title="While Tobi slept" sub="A slice of Nvidia, from London" />
                </div>
              </Float>
            </div>

            <div className="mt-6 flex justify-center">
              <h1>
                <span className="sr-only">Allowance. </span>
                <Logo size="lg" />
              </h1>
            </div>
            <p className="mx-auto mt-4 max-w-lg text-xl font-bold text-moon-dim md:text-2xl">Kids wake up owning a little more.</p>
            <p className="mx-auto mt-3 max-w-md text-moon-dim">Allowance lands at midnight, family abroad gifts real shares, and you approve every purchase with Face ID.</p>
            <div className="mx-auto mt-7 flex max-w-md flex-col justify-center gap-3 sm:flex-row">
              <Link href="/demo" className="btn flex-1">
                Try the 2-minute demo
              </Link>
              <Link href="/parent" className="btn btn-white flex-1 shadow">
                Set up your family
              </Link>
            </div>
            <p className="mt-3 text-sm text-moon-dim">No wallet or sign-up for the demo. Real Base transactions, tiny amounts paid by us.</p>
          </section>

          {/* Story */}
          <section id="how" className="mt-24 scroll-mt-6">
            <h2 className="text-center text-3xl font-extrabold md:text-4xl">How a night shift works</h2>
            <div className="mt-8 overflow-hidden rounded-[32px] bg-white p-2 shadow-xl">
              <NightScene className="h-auto w-full" />
            </div>
            <div className="mt-5 grid gap-5 md:grid-cols-2">
              {story.map((s) => (
                <article key={s.title} className="rounded-[32px] bg-[#FFF5DC] p-8">
                  <p className="die-cut text-6xl" aria-hidden>
                    {s.sticker}
                  </p>
                  <h3 className="mt-6 text-xl font-extrabold">{s.title}</h3>
                  <p className="mt-2 font-semibold text-moon-dim">{s.body}</p>
                </article>
              ))}
            </div>
          </section>

          {/* Why */}
          <section className="mt-5 rounded-[32px] bg-ink p-8 text-white md:p-12">
            <h2 className="max-w-xl text-3xl font-extrabold md:text-4xl">Money sent home gets spent. Shares get to grow.</h2>
            <p className="mt-3 max-w-xl font-semibold opacity-75">
              Billions travel to families every year, usually overnight, as cash. Kids in the US have Greenlight and Acorns. Kids in Lagos don&apos;t, even though they can now own real
              US stocks on Base.
            </p>
          </section>

          {/* Safety */}
          <section id="safety" className="mt-24 scroll-mt-6">
            <h2 className="text-center text-3xl font-extrabold md:text-4xl">Safe by design</h2>
            <div className="mt-8 grid gap-5 md:grid-cols-3">
              {safety.map(([i, t, b]) => (
                <article key={t} className="rounded-[32px] bg-[#FFF5DC] p-8">
                  <p className="die-cut text-5xl" aria-hidden>
                    {i}
                  </p>
                  <h3 className="mt-5 text-lg font-extrabold">{t}</h3>
                  <p className="mt-2 font-semibold text-moon-dim">{b}</p>
                </article>
              ))}
            </div>
          </section>

          {/* FAQ */}
          <section id="faq" className="mx-auto mt-24 w-full max-w-3xl scroll-mt-6">
            <h2 className="text-center text-3xl font-extrabold md:text-4xl">Questions parents ask</h2>
            <div className="mt-8 flex flex-col">
              {faq.map(([q, a]) => (
                <details key={q} className="fold">
                  <summary>{q}</summary>
                  <p className="mt-3 font-semibold text-moon-dim">{a}</p>
                </details>
              ))}
            </div>
          </section>

          {/* Final call */}
          <section className="mt-24 rounded-[32px] bg-gradient-to-b from-[#FFE7A6] to-[#FFF3CF] p-10 text-center md:p-14">
            <h2 className="text-3xl font-extrabold md:text-4xl">Live a night shift in 2 minutes.</h2>
            <p className="mx-auto mt-2 max-w-md font-semibold text-moon-dim">Play Tobi, Mum and Aunty Funmi. Every step is a real transaction on Base.</p>
            <Link href="/demo" className="btn mt-6 px-8">
              Start the Adeyemi demo
            </Link>
          </section>
        </main>

        <footer className="mt-20">
          <div className="flex flex-col justify-between gap-8 md:flex-row">
            <Logo />
            <div className="flex gap-16 text-sm font-bold">
              <div className="flex flex-col gap-3">
                <p className="font-extrabold">App</p>
                <Link className="text-moon-dim" href="/demo">
                  Demo
                </Link>
                <Link className="text-moon-dim" href="/parent">
                  Parents
                </Link>
                <Link className="text-moon-dim" href="/kid">
                  Kids
                </Link>
              </div>
              <div className="flex flex-col gap-3">
                <p className="font-extrabold">Project</p>
                <a className="text-moon-dim" href="https://github.com/Stella112/Allowance" target="_blank" rel="noreferrer">
                  GitHub
                </a>
              </div>
            </div>
          </div>
          <p className="mt-8 text-xs font-semibold text-moon-dim">
            Built on Base for Vibeathon 02. Coinbase tokenized stocks are available in eligible jurisdictions outside the U.S. Learning only, not financial advice.
          </p>
          <p className="mt-8 select-none whitespace-nowrap text-center text-[11.5vw] font-extrabold leading-none tracking-tight text-[#FFEFC7] lg:text-[8.5rem]" aria-hidden>
            THE NIGHT SHIFT
          </p>
        </footer>
      </div>
    </div>
  );
}
