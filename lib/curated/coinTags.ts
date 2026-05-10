// Manual classification of common Binance bases. Used to filter out
// memecoins or restrict to blue chips when the user wants signal quality.
// This is an intentional curation, not market-cap auto-rank — Binance API
// doesn't expose market cap.

// Top market-cap coins (large caps, established projects). Adjust freely.
export const BLUE_CHIP_BASES = new Set<string>([
  "BTC", "ETH", "BNB", "SOL", "XRP", "ADA", "AVAX", "DOT", "TRX", "TON",
  "LINK", "MATIC", "POL", "LTC", "BCH", "ATOM", "NEAR", "UNI", "ETC", "XLM",
  "ICP", "FIL", "APT", "ARB", "OP", "INJ", "RNDR", "RENDER", "IMX", "SUI",
  "STX", "AAVE", "MKR", "LDO", "GRT", "SAND", "MANA", "AXS", "EGLD", "ALGO",
  "EOS", "FTM", "FET", "TAO", "HBAR", "VET", "THETA", "QNT", "FLOW", "KAS",
]);

// Known memecoins / very high-risk speculative bases. Exclude from "blue chip"
// view; can also be excluded entirely via the toggle on the trending page.
export const MEMECOIN_BASES = new Set<string>([
  "DOGE", "SHIB", "PEPE", "FLOKI", "BONK", "WIF", "MEME", "BABYDOGE",
  "ELON", "SAMO", "DOGE2", "MYRO", "BOME", "POPCAT", "MEW", "TURBO",
  "BRETT", "ANDY", "TROLL", "MOODENG", "GOAT", "PNUT", "ACT", "FARTCOIN",
  "PEIPEI", "NEIRO", "MOG", "CHILLGUY", "PONKE", "BANANA",
]);

export type CoinTag = "blue_chip" | "memecoin" | "other";

export function tagFor(base: string): CoinTag {
  if (BLUE_CHIP_BASES.has(base)) return "blue_chip";
  if (MEMECOIN_BASES.has(base)) return "memecoin";
  return "other";
}
