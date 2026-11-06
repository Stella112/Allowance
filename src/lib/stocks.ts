// Verified tokens only — sources in docs/VERIFIED.md. Identify tokens by address, never by symbol.
export type Ticker = "AAPL" | "NVDA";

export type Stock = {
  ticker: Ticker;
  name: string;
  token: `0x${string}`;
  tickSpacing: number;
  emoji: string;
};

export const STOCKS: Record<Ticker, Stock> = {
  AAPL: {
    ticker: "AAPL",
    name: "Apple",
    token: "0xb200000000000000000000C2e324d24d7eEcd1fb",
    tickSpacing: 10,
    emoji: "🍎",
  },
  NVDA: {
    ticker: "NVDA",
    name: "Nvidia",
    token: "0xb20000000000000000000078ee7ce2fE4908108C",
    tickSpacing: 10,
    emoji: "🎮",
  },
};

export const isTicker = (t: unknown): t is Ticker => t === "AAPL" || t === "NVDA";

export type AgeBand = "6-9" | "10-13" | "14-17";

export type ExplainerCard = {
  whatItDoes: string;
  howItMakesMoney: string;
  oneThingToWatch: string;
};

/** Used when the AI call fails. Written for ages 10-13, factual, no buy/sell advice. */
export const FALLBACK_CARDS: Record<Ticker, ExplainerCard> = {
  AAPL: {
    whatItDoes: "Apple designs iPhones, iPads, Mac computers, AirPods and Apple Watches.",
    howItMakesMoney:
      "It sells those devices, and it also earns money from services like the App Store, iCloud storage and Apple Music.",
    oneThingToWatch:
      "Lots of Apple's money comes from iPhones, so it matters whether people keep buying new ones.",
  },
  NVDA: {
    whatItDoes:
      "Nvidia designs computer chips called GPUs. They make video games look smooth and help power AI like chatbots.",
    howItMakesMoney:
      "It sells its chips to gamers, to companies that build big data centers, and to car and robot makers.",
    oneThingToWatch:
      "Other companies are trying to make their own AI chips, so Nvidia has to keep inventing to stay ahead.",
  },
};

export const ageBandFor = (birthYear: number, now = new Date()): AgeBand => {
  const age = now.getUTCFullYear() - birthYear;
  return age <= 9 ? "6-9" : age <= 13 ? "10-13" : "14-17";
};
