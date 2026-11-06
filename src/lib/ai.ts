import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { config } from "./config";
import { db } from "./db";
import { FALLBACK_CARDS, STOCKS, type AgeBand, type ExplainerCard, type Ticker } from "./stocks";

const MODEL = "claude-opus-5-5";

const SYSTEM = `You write short, friendly explainer cards about real companies for children, for a family app that teaches kids about owning shares.
Rules:
- Facts only, in simple words for the stated age band. Each field is one or two short sentences.
- Never tell anyone to buy, sell or hold anything, and never predict prices or returns.
- No scary or negative framing; "one thing to watch" is a neutral fact a curious kid could keep an eye on.
- No emojis.`;

const cardSchema = {
  type: "object",
  properties: {
    whatItDoes: { type: "string" },
    howItMakesMoney: { type: "string" },
    oneThingToWatch: { type: "string" },
  },
  required: ["whatItDoes", "howItMakesMoney", "oneThingToWatch"],
  additionalProperties: false,
} as const;

function parseCard(text: string): ExplainerCard | null {
  try {
    const j = JSON.parse(text);
    if (typeof j.whatItDoes === "string" && typeof j.howItMakesMoney === "string" && typeof j.oneThingToWatch === "string") {
      return { whatItDoes: j.whatItDoes, howItMakesMoney: j.howItMakesMoney, oneThingToWatch: j.oneThingToWatch };
    }
  } catch {}
  return null;
}

/** Returns a cached AI card, generating it once per company per age band. Falls back to a static card. */
export async function explainerCard(ticker: Ticker, band: AgeBand): Promise<{ card: ExplainerCard; source: "ai" | "fallback" }> {
  const cached = await db().from("ai_cache").select("content").eq("ticker", ticker).eq("age_band", band).eq("kind", "explainer").maybeSingle();
  if (cached.data?.content) return { card: cached.data.content as ExplainerCard, source: "ai" };
  if (!config.anthropicConfigured()) return { card: FALLBACK_CARDS[ticker], source: "fallback" };

  try {
    const client = new Anthropic();
    const response = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 2000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "low", format: { type: "json_schema", schema: cardSchema } },
      system: SYSTEM,
      messages: [
        {
          role: "user",
          content: `Company: ${STOCKS[ticker].name} (ticker ${ticker}). Age band: ${band} years old. Write the card.`,
        },
      ],
    });
    if (response.stop_reason === "refusal") return { card: FALLBACK_CARDS[ticker], source: "fallback" };
    const text = response.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
    const card = parseCard(text);
    if (!card) return { card: FALLBACK_CARDS[ticker], source: "fallback" };
    await db().from("ai_cache").upsert({ ticker, age_band: band, kind: "explainer", content: card });
    return { card, source: "ai" };
  } catch (err) {
    console.error("explainerCard failed", err instanceof Anthropic.APIError ? `${err.status} ${err.message}` : err);
    return { card: FALLBACK_CARDS[ticker], source: "fallback" };
  }
}
