import type { MemberInput, MemberListQuery, MemberSortKey, MemberStatus } from "@slm/contracts";
import { MEMBER_SORT_KEYS } from "@slm/contracts";
import { ConflictError, NotFoundError } from "../../platform/errors";
import { parseSort } from "../../platform/http";
import { statusFilter, type MemberLoanView, type MemberRepository, type MemberView } from "../domain/Member";

const duplicateEmail = () =>
  new ConflictError("DUPLICATE_EMAIL", "Duplicate email", "Another member already uses this email.");

/** Member use cases (SLM-3). Authorization is checked by the route guard before these run. */
export class MemberService {
  constructor(private readonly members: MemberRepository) {}

  async get(id: string): Promise<MemberView> {
    const member = await this.members.findView(id);
    if (!member) throw new NotFoundError("This member");
    return member;
  }

  async list(query: MemberListQuery) {
    const sort = parseSort<MemberSortKey>(query.sort, MEMBER_SORT_KEYS, [{ key: "fullName", desc: false }]);
    const status = statusFilter(query.status);
    const { items, total } = await this.members.list({
      ...(query.q ? { q: query.q } : {}),
      ...(status ? { status } : {}),
      sort,
      page: query.page,
      size: query.size,
    });
    return { items, total, page: query.page, size: query.size };
  }

  async create(input: MemberInput): Promise<MemberView> {
    const r = await this.members.create(input);
    if (r.kind === "duplicate_email") throw duplicateEmail();
    return r.member;
  }

  async update(id: string, version: number, input: MemberInput & { status: MemberStatus }): Promise<MemberView> {
    const r = await this.members.update(id, version, input);
    switch (r.kind) {
      case "ok":
        return r.member;
      case "not_found":
        throw new NotFoundError("This member");
      case "stale":
        throw new ConflictError(
          "STALE_VERSION",
          "Changed by someone else",
          "Someone else changed this member while you were editing. Reload to see their version.",
        );
      case "duplicate_email":
        throw duplicateEmail();
    }
  }

  async loans(memberId: string): Promise<MemberLoanView[]> {
    const loans = await this.members.loansOf(memberId);
    if (!loans) throw new NotFoundError("This member");
    return loans;
  }
}
