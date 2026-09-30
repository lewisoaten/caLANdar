/**
 * HyperLAN design-system primitives. See README.md in this folder.
 *
 *   import { Panel, PageHeader, Tag, hl } from "../components/hl";
 */
export { hl, default as tokens } from "./tokens";
export {
  colors,
  tint,
  hairline,
  fonts,
  effects,
  sectionGap,
  srOnly,
  MOBILE_MAX_WIDTH,
  chamfer,
  chamferPct,
  bracket,
  tones,
  trophy,
} from "./tokens";
export type { HlTone, ToneColors } from "./tokens";

export { useIsMobile } from "./useIsMobile";
export { usePrefersReducedMotion } from "./usePrefersReducedMotion";
export {
  BackgroundFx,
  BackgroundFxProvider,
  useBackgroundFx,
} from "./BackgroundFx";

export { BrandMark } from "./BrandMark";
export type { BrandMarkProps } from "./BrandMark";
export { Panel } from "./Panel";
export type { PanelProps } from "./Panel";
export { Kicker } from "./Kicker";
export type { KickerProps } from "./Kicker";
export { PageHeader } from "./PageHeader";
export type { PageHeaderProps } from "./PageHeader";
export { Tag } from "./Tag";
export type { TagProps } from "./Tag";
export { StatCell, StatGrid } from "./StatCell";
export type { StatCellProps, StatGridProps } from "./StatCell";
export {
  UserAvatar,
  getInitials,
  avatarGradient,
  AVATAR_GRADIENTS,
} from "./UserAvatar";
export type { UserAvatarProps } from "./UserAvatar";
export {
  HlPagination,
  getPageItems,
  formatRange,
  pageCount,
} from "./HlPagination";
export type { HlPaginationProps, PageItem } from "./HlPagination";
export { FilterChips } from "./FilterChips";
export type { FilterChipsProps, FilterOption } from "./FilterChips";
export { SearchField } from "./SearchField";
export type { SearchFieldProps } from "./SearchField";
export { EmptyState } from "./EmptyState";
export type { EmptyStateProps } from "./EmptyState";
export {
  Countdown,
  splitCountdown,
  formatCountdown,
  useNow,
  toMillis,
} from "./Countdown";
export type { CountdownProps, CountdownParts, TimeLike } from "./Countdown";
export { Trophy } from "./Trophy";
export type { TrophyProps } from "./Trophy";
export { HlSnackbarProvider, hlSnackbarComponents } from "./HlSnackbarProvider";
