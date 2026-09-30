import * as React from "react";
import { Link as RouterLink } from "react-router-dom";
import Box from "@mui/material/Box";
import ButtonBase from "@mui/material/ButtonBase";
import IconButton from "@mui/material/IconButton";
import Tooltip from "@mui/material/Tooltip";
import LogoutSharp from "@mui/icons-material/LogoutSharp";
import LockSharp from "@mui/icons-material/LockSharp";
import { UserAvatar } from "./hl/UserAvatar";
import { Kicker } from "./hl/Kicker";
import { bracket, colors, fonts, hairline, tint } from "./hl/tokens";
import { useShellState, type ShellState } from "./shell/useShellState";
import { EventCountdownText } from "./shell/EventStatus";
import { useNow } from "./hl/Countdown";
import { NAV_ICONS } from "./shell/navIcons";
import {
  ACCOUNT_ITEM,
  ADMIN_ITEMS,
  EVENTS_ITEM,
  eventNavItems,
  eventPhase,
  isActiveItem,
  type NavItem,
} from "./shell/navModel";

interface MenuItemsProps {
  /** Shell state from `useShellState()`; fetched here when omitted. */
  shell?: ShellState;
  /** `sidebar`: desktop left rail. `sheet`: the mobile menu sheet. */
  variant?: "sidebar" | "sheet";
  /** Called after a destination is chosen (closes the mobile sheet). */
  onNavigate?: () => void;
  /** Mobile sheet only: also list Events (when there is no bottom tab bar). */
  includeEvents?: boolean;
}

const RSVP_TOOLTIP = 'RSVP "Yes" or "Maybe" to access this section.';
const RSVP_LOADING_TOOLTIP = "Checking RSVP status…";

/** Display name for the signed-in user: callsign, else the email's local part. */
export const displayName = (shell: Pick<ShellState, "handle" | "email">) =>
  shell.handle || shell.email.split("@")[0] || "Player";

interface RowProps {
  item: NavItem;
  index: number;
  active: boolean;
  locked: boolean;
  lockReason: string;
  dense?: boolean;
  sheet?: boolean;
  tag?: string;
  onNavigate?: () => void;
}

function NavRow({
  item,
  index,
  active,
  locked,
  lockReason,
  dense,
  sheet,
  tag,
  onNavigate,
}: RowProps) {
  const Icon = NAV_ICONS[item.key];
  const rowSx = {
    width: "100%",
    minHeight: sheet ? 52 : 44,
    display: "flex",
    alignItems: "center",
    justifyContent: "flex-start",
    gap: sheet ? "14px" : "12px",
    pl: sheet ? 1 : dense ? 1.5 : 2.5,
    pr: sheet ? 1 : dense ? 1.5 : 2,
    fontFamily: fonts.ui,
    fontSize: sheet ? 16 : dense ? 14 : 15,
    fontWeight: 500,
    letterSpacing: "0.02em",
    textAlign: "left",
    textDecoration: "none",
    color: active ? colors.cyan : colors.textNav,
    backgroundColor: active ? tint("cyan", 0.08) : "transparent",
    boxShadow: active && !sheet ? `inset 3px 0 0 ${colors.cyan}` : "none",
    transition: "background-color .15s, color .15s",
    "&:hover": locked
      ? {}
      : {
          color: active ? colors.cyan : colors.text,
          backgroundColor: tint("cyan", active ? 0.1 : 0.05),
        },
    "&.Mui-focusVisible, &:focus-visible": {
      outline: `2px solid ${colors.cyan}`,
      outlineOffset: -2,
    },
    ...(locked && { color: colors.textDim, cursor: "not-allowed" }),
    "& > svg": { fontSize: dense ? 19 : 20, flex: "none" },
  } as const;

  const content = (
    <>
      <Icon aria-hidden="true" />
      <Box component="span" sx={{ flex: 1, minWidth: 0 }}>
        {item.label}
      </Box>
      {locked && (
        <LockSharp aria-hidden="true" sx={{ fontSize: "16px !important" }} />
      )}
      {tag ? (
        <Box
          component="span"
          sx={{ fontFamily: fonts.mono, fontSize: 10, color: colors.amber }}
        >
          {tag}
        </Box>
      ) : (
        !sheet && (
          <Box
            component="span"
            aria-hidden="true"
            sx={{ fontFamily: fonts.mono, fontSize: 10, color: colors.textDim }}
          >
            {String(index + 1).padStart(2, "0")}
          </Box>
        )
      )}
    </>
  );

  if (locked) {
    return (
      <Tooltip title={lockReason} placement="right">
        <ButtonBase
          component="span"
          role="link"
          aria-disabled="true"
          aria-label={`${item.label} (locked: ${lockReason})`}
          tabIndex={0}
          sx={rowSx}
        >
          {content}
        </ButtonBase>
      </Tooltip>
    );
  }

  return (
    <ButtonBase
      component={RouterLink}
      to={item.to}
      aria-current={active ? "page" : undefined}
      onClick={onNavigate}
      sx={rowSx}
    >
      {content}
    </ButtonBase>
  );
}

function NavGroup({
  label,
  tone,
  children,
}: {
  label: string;
  tone?: "amber";
  children: React.ReactNode;
}) {
  const id = React.useId();
  return (
    <Box
      component="div"
      role="group"
      aria-labelledby={id}
      sx={{ display: "flex", flexDirection: "column", gap: "2px" }}
    >
      <Kicker
        id={id}
        tone={tone ?? "dim"}
        sx={{ px: 2.5, pb: 1, fontSize: 10 }}
      >
        {label}
      </Kicker>
      {children}
    </Box>
  );
}

/**
 * The navigation lists of the app shell (desktop sidebar body, or the mobile
 * menu sheet): Play (Events + the active event card), Profile, and the amber
 * Admin group for admins, with the signed-in user and sign out.
 */
export default function MenuItems({
  shell: shellProp,
  variant = "sidebar",
  onNavigate,
  includeEvents = false,
}: MenuItemsProps) {
  const own = useShellState({ enabled: !shellProp });
  const shell = shellProp ?? own;
  const { route, isAdmin, activeEvent, access, loggedIn } = shell;
  const now = useNow(30000);

  if (!loggedIn) return null;

  const lockReason = access.loading ? RSVP_LOADING_TOOLTIP : RSVP_TOOLTIP;
  const isLocked = (item: NavItem) =>
    Boolean(item.requiresRsvp) && !access.attending;

  if (variant === "sheet") {
    const items: Array<[NavItem, string | undefined]> = [
      ...(includeEvents
        ? [[EVENTS_ITEM, undefined] as [NavItem, undefined]]
        : []),
      [ACCOUNT_ITEM, undefined],
      ...(isAdmin
        ? ADMIN_ITEMS.map((i) => [i, "ADMIN"] as [NavItem, string])
        : []),
    ];
    return (
      <Box
        component="nav"
        aria-label="Menu"
        sx={{ display: "flex", flexDirection: "column", gap: 0.5 }}
      >
        {items.map(([item, tag], i) => (
          <NavRow
            key={item.key}
            item={item}
            index={i}
            active={isActiveItem(item, route)}
            locked={false}
            lockReason=""
            sheet
            tag={tag}
            onNavigate={onNavigate}
          />
        ))}
        <ButtonBase
          onClick={() => {
            onNavigate?.();
            shell.signOut();
          }}
          sx={{
            minHeight: 52,
            justifyContent: "flex-start",
            gap: "14px",
            px: 1,
            fontSize: 16,
            fontWeight: 500,
            color: colors.pinkText,
            "&:hover": { backgroundColor: tint("pink", 0.08) },
            "&.Mui-focusVisible": {
              outline: `2px solid ${colors.cyan}`,
              outlineOffset: -2,
            },
          }}
        >
          <LogoutSharp aria-hidden="true" />
          Sign out
        </ButtonBase>
      </Box>
    );
  }

  const eventItems = activeEvent ? eventNavItems(activeEvent.id) : [];
  const phase = activeEvent
    ? eventPhase(activeEvent.timeBegin, activeEvent.timeEnd, now)
    : null;

  return (
    <Box
      sx={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}
    >
      <Box
        component="nav"
        aria-label="Main"
        sx={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          gap: "22px",
          py: "18px",
        }}
      >
        <NavGroup label="Play">
          <NavRow
            item={EVENTS_ITEM}
            index={0}
            active={isActiveItem(EVENTS_ITEM, route)}
            locked={false}
            lockReason=""
            onNavigate={onNavigate}
          />
        </NavGroup>

        {activeEvent && (
          <Box
            role="group"
            aria-label={`Active event: ${activeEvent.title}`}
            sx={{
              mx: 1.5,
              py: "12px",
              pb: "6px",
              border: `1px solid ${tint("cyan", 0.18)}`,
              backgroundColor: tint("cyan", 0.03),
              ...bracket({ size: 10 }),
            }}
          >
            <Box
              sx={{
                px: 1.5,
                pb: 1.25,
                display: "flex",
                flexDirection: "column",
                gap: 0.5,
              }}
            >
              <Box
                sx={{
                  display: "flex",
                  alignItems: "center",
                  gap: 0.75,
                  fontFamily: fonts.mono,
                  fontSize: 10,
                  letterSpacing: "0.16em",
                  color: phase === "ended" ? colors.textMuted : colors.lime,
                }}
              >
                {phase !== "ended" && (
                  <Box
                    component="span"
                    aria-hidden="true"
                    sx={{
                      width: 6,
                      height: 6,
                      borderRadius: "50%",
                      backgroundColor: colors.lime,
                      animation: "hlPulse 1.6s ease-in-out infinite",
                    }}
                  />
                )}
                {phase === "live" ? "LIVE EVENT" : "ACTIVE EVENT"}
              </Box>
              <Box
                sx={{
                  fontSize: 16,
                  fontWeight: 600,
                  lineHeight: 1.25,
                  overflowWrap: "anywhere",
                }}
              >
                {activeEvent.title}
              </Box>
              <Box
                sx={{
                  fontFamily: fonts.mono,
                  fontSize: 12,
                  color: phase === "ended" ? colors.textMuted : colors.cyan,
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                <EventCountdownText event={activeEvent} />
              </Box>
            </Box>
            {eventItems.map((item, i) => (
              <NavRow
                key={item.key}
                item={item}
                index={i}
                dense
                active={isActiveItem(item, route, activeEvent.id)}
                locked={isLocked(item)}
                lockReason={lockReason}
                onNavigate={onNavigate}
              />
            ))}
          </Box>
        )}

        <NavGroup label="Profile">
          <NavRow
            item={ACCOUNT_ITEM}
            index={0}
            active={isActiveItem(ACCOUNT_ITEM, route)}
            locked={false}
            lockReason=""
            onNavigate={onNavigate}
          />
        </NavGroup>

        {isAdmin && (
          <NavGroup label="Admin" tone="amber">
            {ADMIN_ITEMS.map((item, i) => (
              <NavRow
                key={item.key}
                item={item}
                index={i}
                active={isActiveItem(item, route)}
                locked={false}
                lockReason=""
                onNavigate={onNavigate}
              />
            ))}
          </NavGroup>
        )}
      </Box>

      <Box
        sx={{
          flex: "none",
          px: 2,
          py: "14px",
          borderTop: `1px solid ${hairline.chrome}`,
          display: "flex",
          alignItems: "center",
          gap: 1.5,
        }}
      >
        <UserAvatar name={displayName(shell)} src={shell.avatarUrl} size={36} />
        <Box
          sx={{
            flex: 1,
            minWidth: 0,
            display: "flex",
            flexDirection: "column",
            gap: "2px",
          }}
        >
          <Box
            sx={{
              fontSize: 14,
              fontWeight: 600,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {displayName(shell)}
          </Box>
          <Box
            sx={{
              fontFamily: fonts.mono,
              fontSize: 11,
              color: colors.textDim,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {shell.email}
          </Box>
        </Box>
        <Tooltip title="Sign out">
          <IconButton
            aria-label="Sign out"
            onClick={shell.signOut}
            sx={{
              border: `1px solid ${tint("cyan", 0.2)}`,
              color: colors.textMuted,
              "&:hover": {
                color: colors.pink,
                borderColor: colors.pink,
                backgroundColor: tint("pink", 0.08),
              },
            }}
          >
            <LogoutSharp sx={{ fontSize: 20 }} />
          </IconButton>
        </Tooltip>
      </Box>
    </Box>
  );
}
