import { BorrowInputSchema, LoanListQuerySchema, Uuid, type LoanDto } from "@slm/contracts";
import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv } from "../../platform/appEnv";
import { parseOr400 } from "../../platform/http";
import { requirePermission } from "../../platform/security/requirePermission";
import type { LoanView } from "../domain/Loan";

export function toLoanDto(l: LoanView): LoanDto {
  return {
    id: l.id,
    status: l.status,
    book: l.book,
    member: l.member,
    processedBy: l.processedBy,
    returnedBy: l.returnedBy,
    borrowedAt: l.borrowedAt.toISOString(),
    dueAt: l.dueAt.toISOString(),
    returnedAt: l.returnedAt?.toISOString() ?? null,
    renewedAt: l.renewedAt?.toISOString() ?? null,
  };
}

const body = async (c: { req: { json: () => Promise<unknown> } }) => c.req.json().catch(() => null);
const IdParam = z.object({ id: Uuid });

/** /api/loans (SLM-4 borrow/return, SLM-5 history, SLM-18 renew). Permissions per rbac-matrix.md. */
export function loanRoutes() {
  const r = new Hono<AppEnv>();

  r.get("/", requirePermission("LOAN_READ"), async (c) => {
    const query = parseOr400(LoanListQuerySchema, c.req.query());
    const page = await c.var.container.circulation.list(query);
    return c.json({ ...page, items: page.items.map(toLoanDto) });
  });

  r.post("/borrow", requirePermission("LOAN_PROCESS"), async (c) => {
    const input = parseOr400(BorrowInputSchema, await body(c));
    const loan = await c.var.container.circulation.borrow(input, c.var.principal.id);
    c.header("location", `/api/loans/${loan.id}`);
    return c.json(toLoanDto(loan), 201);
  });

  r.get("/:id", requirePermission("LOAN_READ"), async (c) => {
    const { id } = parseOr400(IdParam, { id: c.req.param("id") });
    return c.json(toLoanDto(await c.var.container.circulation.get(id)));
  });

  r.post("/:id/return", requirePermission("LOAN_PROCESS"), async (c) => {
    const { id } = parseOr400(IdParam, { id: c.req.param("id") });
    return c.json(toLoanDto(await c.var.container.circulation.return(id, c.var.principal.id)));
  });

  r.post("/:id/renew", requirePermission("LOAN_PROCESS"), async (c) => {
    const { id } = parseOr400(IdParam, { id: c.req.param("id") });
    return c.json(toLoanDto(await c.var.container.circulation.renew(id, c.var.principal.id)));
  });

  return r;
}
