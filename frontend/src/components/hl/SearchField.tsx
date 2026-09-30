import * as React from "react";
import Box from "@mui/material/Box";
import InputBase from "@mui/material/InputBase";
import IconButton from "@mui/material/IconButton";
import type { SxProps, Theme } from "@mui/material/styles";
import SearchSharp from "@mui/icons-material/SearchSharp";
import CloseSharp from "@mui/icons-material/CloseSharp";
import { colors, hairline, tint } from "./tokens";

export interface SearchFieldProps {
  value: string;
  onChange: (value: string) => void;
  /** Accessible name (also the placeholder unless `placeholder` is set). */
  label: string;
  placeholder?: string;
  /** Leading icon; defaults to a search glass. */
  icon?: React.ReactNode;
  /** Show a clear (x) button when there is text. Default true. */
  clearable?: boolean;
  autoFocus?: boolean;
  id?: string;
  sx?: SxProps<Theme>;
}

/** Search/filter input with a leading icon, as used above every list. */
export function SearchField({
  value,
  onChange,
  label,
  placeholder,
  icon,
  clearable = true,
  autoFocus,
  id,
  sx,
}: SearchFieldProps) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  return (
    <Box
      component="label"
      sx={[
        {
          display: "flex",
          alignItems: "center",
          gap: "10px",
          minHeight: 48,
          pl: "14px",
          pr: 0.5,
          border: `1px solid ${hairline.control}`,
          backgroundColor: colors.surface,
          cursor: "text",
          transition: "border-color .15s, box-shadow .15s",
          "&:hover": { borderColor: hairline.strong },
          "&:focus-within": {
            borderColor: colors.cyan,
            boxShadow: `0 0 0 3px ${tint("cyan", 0.18)}`,
          },
          "& > svg": { fontSize: 20, color: colors.textDim, flex: "none" },
        },
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
    >
      {icon ?? <SearchSharp aria-hidden="true" />}
      <InputBase
        inputRef={inputRef}
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder ?? label}
        autoFocus={autoFocus}
        inputProps={{ "aria-label": label, type: "search" }}
        sx={{
          flex: 1,
          minWidth: 0,
          fontSize: 15,
          color: colors.text,
          "& input::-webkit-search-cancel-button": { display: "none" },
          // The label wrapper shows the focus state instead.
          "& input:focus-visible": { outline: "none" },
        }}
      />
      {clearable && value && (
        <IconButton
          aria-label="Clear search"
          onClick={(e) => {
            e.preventDefault();
            onChange("");
            inputRef.current?.focus();
          }}
          sx={{ minWidth: 40, minHeight: 40 }}
        >
          <CloseSharp fontSize="small" />
        </IconButton>
      )}
    </Box>
  );
}

export default SearchField;
