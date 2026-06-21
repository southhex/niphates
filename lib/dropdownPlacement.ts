// Pure geometry helpers for positioning portaled dropdowns within the viewport.
// No "server-only" — imported by client components (Select) and unit-tested.

/**
 * Keep a fixed-position dropdown of `contentWidth` within the viewport on the
 * horizontal axis. Prefers aligning its left edge to `anchorLeft`, but shifts
 * it left so it never bleeds off the right edge, and never past `margin` on the
 * left. If the content is wider than the viewport allows, pins it to the left
 * margin (a `max-width` on the element then keeps it from overflowing).
 */
export function clampLeft(
  anchorLeft: number,
  contentWidth: number,
  viewportWidth: number,
  margin = 8,
): number {
  const maxLeft = viewportWidth - contentWidth - margin;
  if (maxLeft < margin) return margin; // wider than the viewport allows
  return Math.max(margin, Math.min(anchorLeft, maxLeft));
}
