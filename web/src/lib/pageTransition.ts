import { prefersReducedMotion } from "./motion";

/** Sidebar order: moving down the list slides the page up ("forward"), moving up slides it down ("backward"). */
const SECTIONS = ["dashboard", "books", "members", "circulation", "loans", "discover", "admin"];

const parts = (pathname: string) => pathname.split("/").filter(Boolean);

export type PageTransition = "forward" | "backward" | "deeper" | "shallower" | "tab";

/**
 * Which page transition a navigation gets, as view-transition types (see index.css), or false for none.
 * - another sidebar section: forward / backward, by sidebar order;
 * - within a section: deeper (list → a book or member) or shallower (back to the list);
 * - Circulation's Borrow / Return tabs: tab;
 * - only the query changed (typing in a search box, paging, sorting), first load, or reduced motion: none.
 */
export function pageTransitionTypes({
  fromLocation,
  toLocation,
  pathChanged,
}: {
  fromLocation?: { pathname: string };
  toLocation: { pathname: string };
  pathChanged: boolean;
}): PageTransition[] | false {
  if (!fromLocation || !pathChanged || prefersReducedMotion()) return false;
  const from = parts(fromLocation.pathname);
  const to = parts(toLocation.pathname);
  if (from[0] && from[0] === to[0]) {
    if (from[0] === "circulation") return ["tab"];
    return [to.length >= from.length ? "deeper" : "shallower"];
  }
  const a = SECTIONS.indexOf(from[0] ?? "");
  const b = SECTIONS.indexOf(to[0] ?? "");
  return [b >= a ? "forward" : "backward"];
}
