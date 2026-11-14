// Pure billing rules, kept apart from the database so they can be tested.

export type BillableChild = {
  id: string;
  first_name: string;
  date_of_birth: string;
  plan: { name: string; amount_pesewas: number } | null;
  /** Parent account ids linked to the child; children sharing a parent are siblings. */
  parentIds: string[];
};

export type DraftLine = { description: string; quantity: number; unit_pesewas: number };

/**
 * Groups children into families: two children are in the same family when they
 * share a parent account, directly or through another sibling.
 */
export function families(children: { id: string; parentIds: string[] }[]): string[][] {
  const parent = new Map<string, string>();
  const find = (x: string): string => {
    const p = parent.get(x) ?? x;
    if (p === x) return x;
    const root = find(p);
    parent.set(x, root);
    return root;
  };
  const union = (a: string, b: string) => parent.set(find(a), find(b));
  const firstChildOfParent = new Map<string, string>();
  for (const c of children) {
    parent.set(c.id, find(c.id));
    for (const p of c.parentIds) {
      const other = firstChildOfParent.get(p);
      if (other) union(c.id, other);
      else firstChildOfParent.set(p, c.id);
    }
  }
  const groups = new Map<string, string[]>();
  for (const c of children) {
    const root = find(c.id);
    groups.set(root, [...(groups.get(root) ?? []), c.id]);
  }
  return [...groups.values()];
}

/**
 * The lines of each child's termly invoice. The eldest child in a family pays the
 * full fee; each younger sibling on a termly plan gets the sibling discount.
 */
export function termInvoiceLines(
  children: BillableChild[],
  termName: string,
  siblingDiscountPercent: number,
): Map<string, DraftLine[]> {
  const billable = children.filter((c) => c.plan);
  const byId = new Map(billable.map((c) => [c.id, c]));
  const result = new Map<string, DraftLine[]>();
  for (const family of families(billable)) {
    const ordered = family
      .map((id) => byId.get(id)!)
      .sort((a, b) => a.date_of_birth.localeCompare(b.date_of_birth) || a.id.localeCompare(b.id));
    ordered.forEach((child, i) => {
      const plan = child.plan!;
      const lines: DraftLine[] = [{ description: `${plan.name}, ${termName}`, quantity: 1, unit_pesewas: plan.amount_pesewas }];
      if (i > 0 && siblingDiscountPercent > 0) {
        const discount = Math.round((plan.amount_pesewas * siblingDiscountPercent) / 100);
        if (discount > 0) {
          lines.push({ description: `Sibling discount (${siblingDiscountPercent}%)`, quantity: 1, unit_pesewas: -discount });
        }
      }
      result.set(child.id, lines);
    });
  }
  return result;
}

export type InvoiceForAllocation = { id: string; issued_on: string; number: number; total: number };

/**
 * How much of each invoice is paid, applying payments (and leaving feeding charges
 * first, as they are day-to-day) oldest invoice first. Only for display: the
 * account balance is what the family owes.
 */
export function allocatePayments(
  invoices: InvoiceForAllocation[],
  paidTotal: number,
  feedingTotal: number,
): Map<string, { paid: number; outstanding: number }> {
  let remaining = Math.max(0, paidTotal - feedingTotal);
  const result = new Map<string, { paid: number; outstanding: number }>();
  const sorted = [...invoices].sort((a, b) => a.issued_on.localeCompare(b.issued_on) || a.number - b.number);
  for (const inv of sorted) {
    const paid = Math.min(Math.max(inv.total, 0), remaining);
    remaining -= paid;
    result.set(inv.id, { paid, outstanding: inv.total - paid });
  }
  return result;
}
