import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { toCsv } from "@/lib/csv";
import { invoiceNumber } from "@/lib/account";
import { paymentLabel } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";

const ghs = (pesewas: number) => (pesewas / 100).toFixed(2);

/** CSV downloads for the accountant: payments, invoices or balances. Owner and admin only. */
export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user || !["owner", "admin"].includes(user.role) || !user.mfaVerified) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const url = new URL(request.url);
  const kind = url.searchParams.get("kind");
  const from = url.searchParams.get("from") ?? "2000-01-01";
  const to = url.searchParams.get("to") ?? "2999-12-31";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
    return NextResponse.json({ error: "bad dates" }, { status: 400 });
  }
  const supabase = await createClient();
  let rows: (string | number | null)[][];

  if (kind === "payments") {
    const { data } = await supabase
      .from("payments")
      .select("id, paid_at, amount_pesewas, method, channel, status, reference, note, children(first_name, last_name)")
      .in("status", ["success", "void"])
      .gte("paid_at", `${from}T00:00:00Z`)
      .lte("paid_at", `${to}T23:59:59Z`)
      .order("paid_at");
    rows = [
      ["Date", "Child", "Amount (GHS)", "Method", "Status", "Reference", "Note", "Receipt ref"],
      ...(data ?? []).map((p) => {
        const c = p.children as unknown as { first_name: string; last_name: string } | null;
        return [
          p.paid_at?.slice(0, 10) ?? "",
          c ? `${c.first_name} ${c.last_name}` : "",
          ghs(p.amount_pesewas),
          paymentLabel(p),
          p.status,
          p.reference,
          p.note,
          p.id.slice(0, 8).toUpperCase(),
        ];
      }),
    ];
  } else if (kind === "invoices") {
    const { data } = await supabase
      .from("invoices")
      .select("number, issued_on, due_on, description, voided_at, children(first_name, last_name), invoice_lines(amount_pesewas)")
      .gte("issued_on", from)
      .lte("issued_on", to)
      .order("number");
    rows = [
      ["Invoice", "Issued", "Due", "Child", "Description", "Total (GHS)", "Status"],
      ...(data ?? []).map((i) => {
        const c = i.children as unknown as { first_name: string; last_name: string } | null;
        const total = (i.invoice_lines as { amount_pesewas: number }[]).reduce((s, l) => s + l.amount_pesewas, 0);
        return [
          invoiceNumber(i.number),
          i.issued_on,
          i.due_on,
          c ? `${c.first_name} ${c.last_name}` : "",
          i.description,
          ghs(total),
          i.voided_at ? "void" : "issued",
        ];
      }),
    ];
  } else if (kind === "balances") {
    const { data } = await supabase
      .from("child_balances")
      .select("invoiced_pesewas, feeding_pesewas, paid_pesewas, balance_pesewas, children!inner(first_name, last_name, status)")
      .order("balance_pesewas", { ascending: false });
    rows = [
      ["Child", "Status", "Invoiced (GHS)", "Feeding (GHS)", "Paid (GHS)", "Balance (GHS)"],
      ...(data ?? []).map((b) => {
        const c = b.children as unknown as { first_name: string; last_name: string; status: string };
        return [
          `${c.first_name} ${c.last_name}`,
          c.status,
          ghs(Number(b.invoiced_pesewas)),
          ghs(Number(b.feeding_pesewas)),
          ghs(Number(b.paid_pesewas)),
          ghs(Number(b.balance_pesewas)),
        ];
      }),
    ];
  } else {
    return NextResponse.json({ error: "unknown export" }, { status: 400 });
  }

  return new NextResponse(toCsv(rows), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="busy-bees-${kind}-${from}-to-${to}.csv"`.replace("2000-01-01-to-2999-12-31", "all"),
      "cache-control": "no-store",
    },
  });
}
