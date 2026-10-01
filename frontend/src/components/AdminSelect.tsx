import * as React from "react";
import { useId } from "react";
import Box from "@mui/material/Box";
import InputBase from "@mui/material/InputBase";
import MenuItem from "@mui/material/MenuItem";
import Select from "@mui/material/Select";
import type { SxProps, Theme } from "@mui/material/styles";
import { colors, fonts, hairline, tint } from "./hl";

export interface AdminSelectProps<T extends string> {
  /** Short inline label shown before the value (`SORT`, `WHEN`). */
  label: string;
  /** Longer accessible name for the combobox, e.g. "Sort gamers by". */
  ariaLabel?: string;
  value: T;
  options: ReadonlyArray<{ id: T; label: string }>;
  onChange: (value: T) => void;
  sx?: SxProps<Theme>;
}

/**
 * HUD dropdown used by the admin lists: a framed box with a mono inline label
 * and an MUI `Select` whose menu uses the themed solid paper (so the open list
 * is on-theme in every browser, unlike a native `<select>`).
 */
export function AdminSelect<T extends string>({
  label,
  ariaLabel,
  value,
  options,
  onChange,
  sx,
}: AdminSelectProps<T>) {
  const id = useId();
  const labelId = `${id}-label`;
  return (
    <Box
      sx={[
        {
          display: "inline-flex",
          alignItems: "center",
          gap: "10px",
          minHeight: 44,
          pl: "12px",
          pr: "4px",
          border: `1px solid ${tint("cyan", 0.22)}`,
          backgroundColor: colors.surface,
          transition: "border-color .15s, box-shadow .15s",
          "&:hover": { borderColor: hairline.strong },
          "&:focus-within": {
            borderColor: colors.cyan,
            boxShadow: `0 0 0 3px ${tint("cyan", 0.18)}`,
          },
        },
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
    >
      <Box
        component="span"
        id={labelId}
        aria-hidden={ariaLabel ? true : undefined}
        sx={{
          fontFamily: fonts.mono,
          fontSize: 10,
          letterSpacing: "0.16em",
          textTransform: "uppercase",
          color: colors.textDim,
          flex: "none",
        }}
      >
        {label}
      </Box>
      <Select<T>
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
        input={<InputBase />}
        inputProps={ariaLabel ? { "aria-label": ariaLabel } : undefined}
        labelId={ariaLabel ? undefined : labelId}
        MenuProps={{
          slotProps: {
            paper: {
              sx: {
                backgroundColor: colors.surfaceSolid,
                border: `1px solid ${hairline.control}`,
                boxShadow: `0 18px 40px -16px ${tint("cyan", 0.35)}`,
                maxHeight: 360,
                mt: "4px",
              },
            },
          },
        }}
        sx={{
          flex: "1 1 auto",
          minWidth: 150,
          minHeight: 40,
          fontSize: 14,
          color: colors.text,
          "& .MuiSelect-select": {
            py: 0,
            minHeight: "40px !important",
            pr: "32px !important",
            display: "flex",
            alignItems: "center",
          },
          "& .MuiSelect-select:focus": { backgroundColor: "transparent" },
          "& .MuiSelect-icon": { color: colors.cyan, right: 4 },
        }}
      >
        {options.map((o) => (
          <MenuItem key={o.id} value={o.id}>
            {o.label}
          </MenuItem>
        ))}
      </Select>
    </Box>
  );
}

export default AdminSelect;
