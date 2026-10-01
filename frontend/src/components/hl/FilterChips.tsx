import * as React from "react";
import Box from "@mui/material/Box";
import ButtonBase from "@mui/material/ButtonBase";
import type { SxProps, Theme } from "@mui/material/styles";
import { colors, fonts, tint } from "./tokens";

export interface FilterOption<T extends string = string> {
  id: T;
  label: React.ReactNode;
  /** Number of matching items, shown after the label. */
  count?: number;
}

interface CommonProps<T extends string> {
  options: ReadonlyArray<FilterOption<T>>;
  /** Accessible name for the group, e.g. "Status". */
  label: string;
  sx?: SxProps<Theme>;
}

interface SingleProps<T extends string> extends CommonProps<T> {
  multiple?: false;
  value: T;
  onChange: (value: T) => void;
}

interface MultiProps<T extends string> extends CommonProps<T> {
  /** Allow several chips on at once; `value` is then an array. */
  multiple: true;
  value: ReadonlyArray<T>;
  onChange: (value: T[]) => void;
}

export type FilterChipsProps<T extends string = string> =
  SingleProps<T> | MultiProps<T>;

/**
 * Toggle-button filter row with optional counts (`ALL 15 · LIVE 2 …`). Each
 * chip is a real button with `aria-pressed`. Reset pagination on change.
 */
export function FilterChips<T extends string = string>(
  props: FilterChipsProps<T>,
) {
  const { options, label, sx } = props;
  const isOn = (id: T) =>
    props.multiple ? props.value.includes(id) : props.value === id;

  const toggle = (id: T) => {
    if (props.multiple) {
      const next = props.value.includes(id)
        ? props.value.filter((v) => v !== id)
        : [...props.value, id];
      props.onChange(next);
    } else if (props.value !== id) {
      props.onChange(id);
    }
  };

  return (
    <Box
      role="group"
      aria-label={label}
      sx={[
        { display: "flex", flexWrap: "wrap", gap: "6px" },
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
    >
      {options.map((o) => {
        const on = isOn(o.id);
        return (
          <ButtonBase
            key={o.id}
            aria-pressed={on}
            onClick={() => toggle(o.id)}
            sx={{
              minHeight: 44,
              px: "14px",
              gap: "8px",
              border: `1px solid ${on ? colors.cyan : tint("cyan", 0.22)}`,
              backgroundColor: on ? tint("cyan", 0.12) : "transparent",
              color: on ? colors.cyan : colors.textMuted,
              fontFamily: fonts.mono,
              fontSize: 12,
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              transition: "border-color .15s, color .15s",
              "&:hover": {
                borderColor: on ? colors.cyan : tint("cyan", 0.5),
                color: on ? colors.cyan : colors.text,
              },
              "&.Mui-focusVisible": {
                outline: `2px solid ${colors.cyan}`,
                outlineOffset: 2,
              },
            }}
          >
            <span>{o.label}</span>
            {o.count !== undefined && " "}
            {o.count !== undefined && (
              <Box
                component="span"
                sx={{ color: on ? colors.cyan : colors.textDim, opacity: 0.9 }}
              >
                {o.count}
              </Box>
            )}
          </ButtonBase>
        );
      })}
    </Box>
  );
}

export default FilterChips;
