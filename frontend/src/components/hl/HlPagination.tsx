import * as React from "react";
import Box from "@mui/material/Box";
import ButtonBase from "@mui/material/ButtonBase";
import type { SxProps, Theme } from "@mui/material/styles";
import ChevronLeftSharp from "@mui/icons-material/ChevronLeftSharp";
import ChevronRightSharp from "@mui/icons-material/ChevronRightSharp";
import { colors, fonts, hairline, tint } from "./tokens";

export type PageItem = number | "gap";

/** Number of pages for `total` items (at least 1). */
export function pageCount(total: number, pageSize: number): number {
  return Math.max(1, Math.ceil(Math.max(0, total) / Math.max(1, pageSize)));
}

/**
 * Page buttons to show: first, last and current +-1, with `"gap"` for
 * skipped runs. A gap that would hide a single page shows that page instead.
 * `page` is 1-based.
 */
export function getPageItems(page: number, count: number): PageItem[] {
  if (count <= 0) return [];
  const keep = new Set([1, count, page - 1, page, page + 1]);
  const items: PageItem[] = [];
  let last = 0;
  for (let p = 1; p <= count; p++) {
    if (!keep.has(p)) continue;
    if (p - last === 2) items.push(p - 1);
    else if (p - last > 2) items.push("gap");
    items.push(p);
    last = p;
  }
  return items;
}

/** Range label, e.g. `1–9 OF 30` (`0 OF 0` when empty). `page` is 1-based. */
export function formatRange(page: number, pageSize: number, total: number) {
  if (total <= 0) return "0 OF 0";
  const start = (page - 1) * pageSize + 1;
  const end = Math.min(total, page * pageSize);
  return `${start}–${end} OF ${total}`;
}

export interface HlPaginationProps {
  /** Current page, 1-based. */
  page: number;
  /** Items per page. */
  pageSize: number;
  /** Total number of items across all pages. */
  total: number;
  /** Called with the new 1-based page. */
  onChange: (page: number) => void;
  /** Accessible name of the navigation landmark. */
  label?: string;
  sx?: SxProps<Theme>;
}

const square = {
  minWidth: 40,
  height: 40,
  px: 1,
  display: "grid",
  placeItems: "center",
  border: `1px solid ${hairline.control}`,
  background: "transparent",
  color: colors.text2,
  fontFamily: fonts.mono,
  fontSize: 13,
  "&:hover": { borderColor: colors.cyan, color: colors.cyan },
  "&.Mui-focusVisible": {
    outline: `2px solid ${colors.cyan}`,
    outlineOffset: 2,
  },
  "&.Mui-disabled": {
    color: colors.disabled,
    borderColor: tint("neutral", 0.12),
  },
  "& svg": { fontSize: 20 },
} as const;

/**
 * The shared list pagination control: range text on the left, prev/next and
 * page numbers (with ellipses) on the right. Current page is solid cyan.
 * Reset `page` to 1 whenever a filter, search or sort changes.
 */
export function HlPagination({
  page,
  pageSize,
  total,
  onChange,
  label = "Pages",
  sx,
}: HlPaginationProps) {
  const count = pageCount(total, pageSize);
  const current = Math.min(Math.max(1, page), count);
  const items = getPageItems(current, count);

  return (
    <Box
      component="nav"
      aria-label={label}
      sx={[
        {
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "10px 16px",
        },
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
    >
      <Box
        component="span"
        aria-live="polite"
        sx={{
          fontFamily: fonts.mono,
          fontSize: 12,
          letterSpacing: "0.1em",
          color: colors.textMuted,
        }}
      >
        {formatRange(current, pageSize, total)}
      </Box>
      <Box
        component="ul"
        sx={{
          display: "flex",
          alignItems: "center",
          gap: "4px",
          m: 0,
          p: 0,
          listStyle: "none",
        }}
      >
        <li>
          <ButtonBase
            aria-label="Previous page"
            disabled={current <= 1}
            onClick={() => onChange(current - 1)}
            sx={square}
          >
            <ChevronLeftSharp aria-hidden="true" />
          </ButtonBase>
        </li>
        {items.map((item, i) =>
          item === "gap" ? (
            <Box
              component="li"
              key={`gap-${i}`}
              aria-hidden="true"
              sx={{ width: 22, textAlign: "center", color: colors.textDim }}
            >
              …
            </Box>
          ) : (
            <li key={item}>
              <ButtonBase
                aria-label={`Page ${item}`}
                aria-current={item === current ? "page" : undefined}
                onClick={item === current ? undefined : () => onChange(item)}
                sx={[
                  square,
                  item === current && {
                    backgroundColor: colors.cyan,
                    borderColor: colors.cyan,
                    color: colors.ink,
                    fontWeight: 700,
                    cursor: "default",
                    "&:hover": { color: colors.ink },
                  },
                ]}
              >
                {item}
              </ButtonBase>
            </li>
          ),
        )}
        <li>
          <ButtonBase
            aria-label="Next page"
            disabled={current >= count}
            onClick={() => onChange(current + 1)}
            sx={square}
          >
            <ChevronRightSharp aria-hidden="true" />
          </ButtonBase>
        </li>
      </Box>
    </Box>
  );
}

export default HlPagination;
