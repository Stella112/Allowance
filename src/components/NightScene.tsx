/**
 * The night shift, illustrated: a kid asleep in Lagos while the allowance drops into the savings jar,
 * a gift flies in from London, and Mum checks the Morning Report at sunrise. Pure SVG + CSS animation.
 */
export default function NightScene({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 640 460" className={`night-scene ${className}`} role="img" aria-label="Illustration: a child sleeps while allowance coins drop into a savings jar, a plane brings a gift from London, and Mum waves with her phone at sunrise.">
      <defs>
        <linearGradient id="sky" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#2b2463" />
          <stop offset="0.6" stopColor="#5b47c9" />
          <stop offset="1" stopColor="#ffb9a8" />
        </linearGradient>
        <linearGradient id="jar" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#e9fbf2" />
          <stop offset="1" stopColor="#b9e9d0" />
        </linearGradient>
        <clipPath id="frame">
          <rect x="0" y="0" width="640" height="460" rx="40" />
        </clipPath>
      </defs>

      <g clipPath="url(#frame)">
        <rect width="640" height="460" fill="url(#sky)" />
        {/* stars */}
        {[
          [60, 50], [140, 90], [230, 40], [300, 110], [520, 60], [590, 120], [420, 30], [90, 170],
        ].map(([x, y], i) => (
          <circle key={i} cx={x} cy={y} r={i % 3 ? 2.5 : 3.5} fill="#fff" className="ns-twinkle" style={{ animationDelay: `${i * 0.4}s` }} />
        ))}
        {/* moon */}
        <g className="ns-float" style={{ animationDuration: "7s" }}>
          <circle cx="540" cy="95" r="38" fill="#ffd979" />
          <circle cx="556" cy="84" r="34" fill="#4c3cb6" opacity="0.55" />
        </g>

        {/* plane carrying a gift from London */}
        <g className="ns-plane">
          <path d="M0 0 l46 -6 l14 -14 l8 2 l-8 16 l22 -2 l8 -8 l6 2 l-6 12 l-6 12 l-6 2 l-2 -10 l-24 2 l8 18 l-8 2 l-16 -16 l-36 4 z" fill="#ffffff" />
          <line x1="40" y1="14" x2="40" y2="44" stroke="#ffffff" strokeWidth="2" strokeDasharray="3 3" />
          <g className="ns-swing">
            <rect x="26" y="44" width="28" height="24" rx="5" fill="#ff8f73" />
            <rect x="37" y="44" width="6" height="24" fill="#ffd979" />
            <rect x="26" y="52" width="28" height="6" fill="#ffd979" />
          </g>
          <text x="-10" y="-16" fill="#fff" fontSize="13" fontWeight="800" opacity="0.9">from London ✈</text>
        </g>

        {/* house with sleeping kid */}
        <g transform="translate(40 200)">
          <path d="M0 90 L110 10 L220 90 Z" fill="#ff8f73" />
          <rect x="20" y="88" width="180" height="172" rx="10" fill="#fff7f2" />
          <rect x="44" y="118" width="132" height="104" rx="14" fill="#2b2463" />
          {/* bed */}
          <rect x="54" y="188" width="112" height="22" rx="8" fill="#7656e8" />
          <rect x="54" y="176" width="34" height="16" rx="7" fill="#ffffff" />
          {/* kid sleeping */}
          <g className="ns-breathe">
            <circle cx="74" cy="172" r="15" fill="#8d5524" />
            <path d="M60 166 q14 -16 30 0" fill="#2a1a10" />
            <path d="M66 174 q4 3 8 0" stroke="#2a1a10" strokeWidth="2" fill="none" strokeLinecap="round" />
            <rect x="86" y="170" width="78" height="24" rx="10" fill="#b9e9d0" />
          </g>
          {/* zzz */}
          <text x="96" y="150" fill="#ffd979" fontSize="18" fontWeight="900" className="ns-z">z</text>
          <text x="112" y="140" fill="#ffd979" fontSize="14" fontWeight="900" className="ns-z" style={{ animationDelay: "0.8s" }}>z</text>
          <text x="124" y="132" fill="#ffd979" fontSize="11" fontWeight="900" className="ns-z" style={{ animationDelay: "1.6s" }}>z</text>
        </g>

        {/* savings jar with coins dropping in */}
        <g transform="translate(300 270)">
          <ellipse cx="60" cy="160" rx="70" ry="10" fill="#000" opacity="0.15" />
          <rect x="0" y="40" width="120" height="120" rx="28" fill="url(#jar)" stroke="#fff" strokeWidth="4" />
          <rect x="18" y="26" width="84" height="20" rx="8" fill="#7656e8" />
          <rect x="18" y="104" width="84" height="48" rx="16" fill="#7fd6ad" className="ns-fill" />
          <text x="60" y="92" textAnchor="middle" fill="#1f6b4a" fontSize="16" fontWeight="900">SAVINGS</text>
          {[0, 1, 2].map((i) => (
            <g key={i} className="ns-coin" style={{ animationDelay: `${i * 1.1}s` }}>
              <circle cx="60" cy="-30" r="14" fill="#ffd979" stroke="#e8b931" strokeWidth="3" />
              <text x="60" y="-25" textAnchor="middle" fill="#8a6a00" fontSize="14" fontWeight="900">$</text>
            </g>
          ))}
        </g>

        {/* Mum waving with her phone */}
        <g transform="translate(470 230)">
          <ellipse cx="60" cy="226" rx="56" ry="9" fill="#000" opacity="0.15" />
          <path d="M18 226 q0 -96 42 -96 q42 0 42 96 z" fill="#ffd979" />
          <circle cx="60" cy="102" r="30" fill="#8d5524" />
          <path d="M28 98 q4 -40 34 -40 q32 0 34 42 q-12 -18 -34 -20 q-20 2 -34 18 z" fill="#2a1a10" />
          <circle cx="50" cy="104" r="3" fill="#2a1a10" />
          <circle cx="70" cy="104" r="3" fill="#2a1a10" />
          <path d="M50 116 q10 8 20 0" stroke="#2a1a10" strokeWidth="3" fill="none" strokeLinecap="round" />
          {/* waving arm */}
          <g className="ns-wave">
            <path d="M98 150 l26 -40" stroke="#8d5524" strokeWidth="14" strokeLinecap="round" />
            <circle cx="126" cy="106" r="9" fill="#8d5524" />
          </g>
          {/* phone in other hand */}
          <path d="M24 152 l-6 30" stroke="#8d5524" strokeWidth="14" strokeLinecap="round" />
          <rect x="-4" y="150" width="30" height="48" rx="6" fill="#25243a" />
          <rect x="0" y="156" width="22" height="34" rx="3" fill="#7656e8" className="ns-glow" />
          <path d="M5 172 l5 5 l9 -10" stroke="#fff" strokeWidth="3" fill="none" strokeLinecap="round" />
        </g>

        {/* notification bubble popping above Mum */}
        <g className="ns-pop" transform="translate(370 168)">
          <rect width="200" height="44" rx="22" fill="#ffffff" />
          <text x="100" y="28" textAnchor="middle" fill="#25243a" fontSize="14" fontWeight="800">☀️ Tobi&apos;s pitch is waiting</text>
        </g>
      </g>
    </svg>
  );
}
