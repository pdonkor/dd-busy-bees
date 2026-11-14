// Money is held as whole pesewas (GHS 1 = 100 pesewas) so sums are exact.

const formatter = new Intl.NumberFormat("en-GH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function formatGhs(pesewas: number): string {
  const sign = pesewas < 0 ? "−" : "";
  return `${sign}GHS ${formatter.format(Math.abs(pesewas) / 100)}`;
}

/** "1,200", "1200.5" or "GHS 1,200.50" → 120050 pesewas; null if not a valid positive amount. */
export function parseGhs(input: string): number | null {
  const cleaned = input.replace(/ghs|gh₵|₵|,|\s/gi, "");
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  const [whole, frac = ""] = cleaned.split(".");
  const pesewas = Number(whole) * 100 + Number(frac.padEnd(2, "0"));
  return pesewas > 0 && pesewas <= 100_000_000 ? pesewas : null;
}

export const METHOD_LABEL: Record<string, string> = {
  paystack: "Paystack",
  cash: "Cash",
  bank: "Bank transfer",
  momo_direct: "Mobile money (direct)",
};

export const CHANNEL_LABEL: Record<string, string> = {
  mobile_money: "Mobile money",
  card: "Card",
  bank: "Bank",
  bank_transfer: "Bank transfer",
  ussd: "USSD",
};

export function paymentLabel(p: { method: string; channel?: string | null }): string {
  if (p.method === "paystack" && p.channel) return CHANNEL_LABEL[p.channel] ?? p.channel;
  return METHOD_LABEL[p.method] ?? p.method;
}
