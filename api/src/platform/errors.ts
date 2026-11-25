import type { ErrorCode, Problem } from "@slm/contracts";

export interface FieldError {
  field: string;
  message: string;
}

/** Base of every expected failure. Mapped to RFC 9457 Problem Details at the HTTP edge. */
export class AppError extends Error {
  constructor(
    readonly status: number,
    readonly code: ErrorCode,
    readonly title: string,
    detail?: string,
    readonly fieldErrors?: FieldError[],
    readonly context?: Record<string, unknown>,
  ) {
    super(detail ?? title);
  }
}

export class ValidationError extends AppError {
  constructor(fieldErrors: FieldError[], detail = "The request is not valid.") {
    super(400, "VALIDATION_FAILED", "Validation failed", detail, fieldErrors);
  }
}
export class UnauthenticatedError extends AppError {
  constructor(detail = "Sign in is required.") {
    super(401, "UNAUTHENTICATED", "Not authenticated", detail);
  }
}
export class ForbiddenError extends AppError {
  constructor(
    code: "FORBIDDEN" | "NOT_PROVISIONED" | "USER_DISABLED" = "FORBIDDEN",
    detail = "You don't have permission to do this.",
  ) {
    super(403, code, "Forbidden", detail);
  }
}
export class NotFoundError extends AppError {
  constructor(what: string) {
    super(404, "NOT_FOUND", "Not found", `${what} was not found.`);
  }
}
/** Business-rule conflicts (409): unavailable book, loan limit, stale version… */
export class ConflictError extends AppError {
  constructor(code: ErrorCode, title: string, detail: string, context?: Record<string, unknown>) {
    super(409, code, title, detail, undefined, context);
  }
}

export function toProblem(err: AppError, requestId: string): Problem {
  return {
    type: "about:blank",
    title: err.title,
    status: err.status,
    code: err.code,
    detail: err.message,
    ...(err.fieldErrors?.length ? { errors: err.fieldErrors } : {}),
    ...(err.context ? { context: err.context } : {}),
    requestId,
  };
}

export function internalProblem(requestId: string): Problem {
  return {
    type: "about:blank",
    title: "Internal error",
    status: 500,
    code: "INTERNAL",
    detail: "Something went wrong. Quote the request id if you report it.",
    requestId,
  };
}
