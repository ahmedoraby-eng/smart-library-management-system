import {
  MemberInputSchema,
  MemberListQuerySchema,
  MemberUpdateSchema,
  type LoanDto,
  type MemberDto,
} from "@slm/contracts";
import { Hono } from "hono";
import type { AppEnv } from "../../platform/appEnv";
import { parseOr400 } from "../../platform/http";
import { requirePermission } from "../../platform/security/requirePermission";
import type { MemberLoanView, MemberView } from "../domain/Member";

export function toMemberDto(m: MemberView): MemberDto {
  return {
    id: m.id,
    memberNumber: m.memberNumber,
    fullName: m.fullName,
    email: m.email,
    phone: m.phone,
    status: m.status,
    registeredAt: m.registeredAt.toISOString(),
    activeLoans: m.activeLoans,
    overdueLoans: m.overdueLoans,
    version: m.version,
  };
}

export function toMemberLoanDto(l: MemberLoanView): LoanDto {
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
  };
}

const body = async (c: { req: { json: () => Promise<unknown> } }) => c.req.json().catch(() => null);

/** /api/members (SLM-3). Permissions per rbac-matrix.md; the role is read from the database on every request. */
export function memberRoutes() {
  const r = new Hono<AppEnv>();

  r.get("/", requirePermission("MEMBER_READ"), async (c) => {
    const query = parseOr400(MemberListQuerySchema, c.req.query());
    const page = await c.var.container.members.list(query);
    return c.json({ ...page, items: page.items.map(toMemberDto) });
  });

  r.get("/:id", requirePermission("MEMBER_READ"), async (c) =>
    c.json(toMemberDto(await c.var.container.members.get(c.req.param("id")))),
  );

  r.get("/:id/loans", requirePermission("LOAN_READ"), async (c) =>
    c.json((await c.var.container.members.loans(c.req.param("id"))).map(toMemberLoanDto)),
  );

  r.post("/", requirePermission("MEMBER_WRITE"), async (c) => {
    const input = parseOr400(MemberInputSchema, await body(c));
    const member = await c.var.container.members.create(input);
    c.header("location", `/api/members/${member.id}`);
    return c.json(toMemberDto(member), 201);
  });

  r.put("/:id", requirePermission("MEMBER_WRITE"), async (c) => {
    const { version, ...input } = parseOr400(MemberUpdateSchema, await body(c));
    return c.json(toMemberDto(await c.var.container.members.update(c.req.param("id"), version, input)));
  });

  return r;
}
