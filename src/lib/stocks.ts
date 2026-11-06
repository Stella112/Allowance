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

/**
 * Cards written with Claude while building Allowance, one per age band. Used when live AI is off or fails.
 * Factual, no buy/sell advice, no price predictions.
 */
export const FALLBACK_CARDS: Record<Ticker, Record<AgeBand, ExplainerCard>> = {
  AAPL: {
    "6-9": {
      whatItDoes: "Apple makes iPhones, iPads and Mac computers, plus AirPods for listening to music.",
      howItMakesMoney: "People pay Apple when they buy its gadgets. People also pay for extras like apps, games and music.",
      oneThingToWatch: "Apple keeps making new phones each year. See if your family and friends still want the newest one.",
    },
    "10-13": {
      whatItDoes: "Apple designs iPhones, iPads, Mac computers, AirPods and Apple Watches.",
      howItMakesMoney:
        "It sells those devices, and it also earns money from services like the App Store, iCloud storage and Apple Music.",
      oneThingToWatch: "Lots of Apple's money comes from iPhones, so it matters whether people keep buying new ones.",
    },
    "14-17": {
      whatItDoes:
        "Apple designs consumer hardware (iPhone, Mac, iPad, Watch, AirPods) and the software that ties them together, like iOS and macOS.",
      howItMakesMoney:
        "Most revenue comes from iPhone sales, and a growing share comes from services like the App Store, iCloud, Apple Music and payments, which earn money again and again from the same customers.",
      oneThingToWatch:
        "How fast its services business grows compared with iPhone sales, and how rules about app stores in different countries change what Apple can charge.",
    },
  },
  NVDA: {
    "6-9": {
      whatItDoes: "Nvidia makes special computer chips. They make video games look great and help computers think.",
      howItMakesMoney: "Companies and gamers pay Nvidia to buy its chips.",
      oneThingToWatch: "Other companies are building chips too. See if Nvidia keeps coming up with new ideas.",
    },
    "10-13": {
      whatItDoes:
        "Nvidia designs computer chips called GPUs. They make video games look smooth and help power AI like chatbots.",
      howItMakesMoney: "It sells its chips to gamers, to companies that build big data centers, and to car and robot makers.",
      oneThingToWatch:
        "Other companies are trying to make their own AI chips, so Nvidia has to keep inventing to stay ahead.",
    },
    "14-17": {
      whatItDoes:
        "Nvidia designs GPUs, chips that do many calculations at once. They started in gaming and are now the main hardware used to train and run AI models.",
      howItMakesMoney:
        "Most of its revenue now comes from selling data-center chips and systems to cloud and AI companies. Gaming chips and its CUDA software ecosystem matter too.",
      oneThingToWatch:
        "A few very large customers buy a big share of its chips, and several of them are designing their own, so watch how much they keep buying from Nvidia.",
    },
  },
};

/** Coach questions written with Claude while building Allowance. One is picked when live AI is off. */
export const FALLBACK_COACH: Record<Ticker, Record<AgeBand, string[]>> = {
  AAPL: {
    "6-9": ["What does Apple make?", "Who do you know that uses something made by Apple?", "What could make people stop buying iPhones?"],
    "10-13": ["What does Apple sell, besides iPhones?", "What could go wrong for Apple?", "Why would someone pick an iPhone over another phone?"],
    "14-17": [
      "Apple makes money from devices and from services. Which one do you think matters more, and why?",
      "What could go wrong for Apple in the next few years?",
      "How would you know if your reason for liking Apple stopped being true?",
    ],
  },
  NVDA: {
    "6-9": ["What do Nvidia's chips help computers do?", "Who buys Nvidia's chips?", "What could happen if another company made a better chip?"],
    "10-13": ["What does Nvidia sell, and who buys it?", "What could go wrong for Nvidia?", "Why do AI companies need Nvidia's chips?"],
    "14-17": [
      "Most of Nvidia's money comes from a few big customers. Why could that be a risk?",
      "What could go wrong for Nvidia in the next few years?",
      "How would you know if your reason for liking Nvidia stopped being true?",
    ],
  },
};

export const ageBandFor = (birthYear: number, now = new Date()): AgeBand => {
  const age = now.getUTCFullYear() - birthYear;
  return age <= 9 ? "6-9" : age <= 13 ? "10-13" : "14-17";
};
