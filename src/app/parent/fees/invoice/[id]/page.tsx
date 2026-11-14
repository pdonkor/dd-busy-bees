import { InvoiceView } from "@/components/invoice-view";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export default async function ParentInvoicePage({ params }: { params: Promise<{ id: string }> }) {
  await requireRole("parent");
  const { id } = await params;
  return <InvoiceView supabase={await createClient()} id={id} />;
}
