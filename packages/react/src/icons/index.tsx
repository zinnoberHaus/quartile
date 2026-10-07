import type { ReactNode, SVGProps } from 'react';

/** 16px stroke icons, `currentColor`, 1.5 stroke. Size with `size` or CSS. */
export type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function icon(paths: ReactNode, displayName: string) {
  const Icon = ({ size = 16, strokeWidth = 1.5, ...rest }: IconProps) => (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {paths}
    </svg>
  );
  Icon.displayName = displayName;
  return Icon;
}

export const IconChevronDown = icon(<path d="M4 6l4 4 4-4" />, 'IconChevronDown');
export const IconChevronUp = icon(<path d="M4 10l4-4 4 4" />, 'IconChevronUp');
export const IconChevronLeft = icon(<path d="M10 4L6 8l4 4" />, 'IconChevronLeft');
export const IconChevronRight = icon(<path d="M6 4l4 4-4 4" />, 'IconChevronRight');
export const IconChevronsUpDown = icon(
  <path d="M5 6l3-3 3 3M5 10l3 3 3-3" />,
  'IconChevronsUpDown',
);
export const IconCheck = icon(<path d="M3.5 8.5l3 3 6-7" />, 'IconCheck');
export const IconX = icon(<path d="M4 4l8 8M12 4l-8 8" />, 'IconX');
export const IconPlus = icon(<path d="M8 3.5v9M3.5 8h9" />, 'IconPlus');
export const IconMinus = icon(<path d="M3.5 8h9" />, 'IconMinus');
export const IconSearch = icon(
  <>
    <circle cx="7" cy="7" r="4.5" />
    <path d="M10.5 10.5L14 14" />
  </>,
  'IconSearch',
);
export const IconCalendar = icon(
  <>
    <rect x="2.5" y="3.5" width="11" height="10" rx="1.5" />
    <path d="M2.5 6.5h11M5.5 2v3M10.5 2v3" />
  </>,
  'IconCalendar',
);
export const IconDownload = icon(
  <path d="M8 2.5v8M4.5 7L8 10.5 11.5 7M3 13.5h10" />,
  'IconDownload',
);
export const IconShare = icon(
  <path d="M8 10V2.5M5 5.5l3-3 3 3M3.5 9v3.5a1 1 0 001 1h7a1 1 0 001-1V9" />,
  'IconShare',
);
export const IconCopy = icon(
  <>
    <rect x="5.5" y="5.5" width="8" height="8" rx="1.5" />
    <path d="M10.5 5.5V3.5a1 1 0 00-1-1h-6a1 1 0 00-1 1v6a1 1 0 001 1h2" />
  </>,
  'IconCopy',
);
export const IconExternal = icon(
  <path d="M9.5 2.5h4v4M13.5 2.5L7.5 8.5M12 9.5v3a1 1 0 01-1 1H3.5a1 1 0 01-1-1V5a1 1 0 011-1h3" />,
  'IconExternal',
);
export const IconArrowRight = icon(<path d="M3 8h10M9 4l4 4-4 4" />, 'IconArrowRight');
export const IconArrowUp = icon(<path d="M8 13V3M4 7l4-4 4 4" />, 'IconArrowUp');
export const IconArrowDown = icon(<path d="M8 3v10M4 9l4 4 4-4" />, 'IconArrowDown');
export const IconMore = icon(
  <>
    <circle cx="3.5" cy="8" r=".75" fill="currentColor" />
    <circle cx="8" cy="8" r=".75" fill="currentColor" />
    <circle cx="12.5" cy="8" r=".75" fill="currentColor" />
  </>,
  'IconMore',
);
export const IconFilter = icon(<path d="M2.5 4h11M4.5 8h7M6.5 12h3" />, 'IconFilter');
export const IconColumns = icon(
  <>
    <rect x="2.5" y="2.5" width="11" height="11" rx="1.5" />
    <path d="M6.2 2.5v11M9.8 2.5v11" />
  </>,
  'IconColumns',
);
export const IconGrid = icon(
  <>
    <rect x="2.5" y="2.5" width="4.5" height="4.5" rx="1" />
    <rect x="9" y="2.5" width="4.5" height="4.5" rx="1" />
    <rect x="2.5" y="9" width="4.5" height="4.5" rx="1" />
    <rect x="9" y="9" width="4.5" height="4.5" rx="1" />
  </>,
  'IconGrid',
);
export const IconLineChart = icon(<path d="M2 12l3.5-4 3 2.5L14 4" />, 'IconLineChart');
export const IconBarChart = icon(<path d="M3 13.5V8M8 13.5V3M13 13.5V6" />, 'IconBarChart');
export const IconHeatmap = icon(
  <>
    <rect x="2.5" y="2.5" width="3" height="3" rx=".5" />
    <rect x="6.5" y="2.5" width="3" height="3" rx=".5" fill="currentColor" />
    <rect x="10.5" y="2.5" width="3" height="3" rx=".5" />
    <rect x="2.5" y="6.5" width="3" height="3" rx=".5" fill="currentColor" />
    <rect x="6.5" y="6.5" width="3" height="3" rx=".5" />
    <rect x="10.5" y="6.5" width="3" height="3" rx=".5" fill="currentColor" />
    <rect x="2.5" y="10.5" width="3" height="3" rx=".5" />
    <rect x="6.5" y="10.5" width="3" height="3" rx=".5" fill="currentColor" />
    <rect x="10.5" y="10.5" width="3" height="3" rx=".5" />
  </>,
  'IconHeatmap',
);
export const IconTable = icon(
  <>
    <rect x="2.5" y="3" width="11" height="10" rx="1.5" />
    <path d="M2.5 6.5h11M2.5 9.75h11M6.5 6.5v6.5" />
  </>,
  'IconTable',
);
export const IconInfo = icon(
  <>
    <circle cx="8" cy="8" r="6.25" />
    <path d="M8 7.25v4M8 4.9v.1" />
  </>,
  'IconInfo',
);
export const IconAlert = icon(<path d="M8 2.5l6 10.5H2L8 2.5zM8 6.75v3M8 11.4v.1" />, 'IconAlert');
export const IconAlertCircle = icon(
  <>
    <circle cx="8" cy="8" r="6.25" />
    <path d="M8 4.75v3.75M8 11.1v.15" />
  </>,
  'IconAlertCircle',
);
export const IconCheckCircle = icon(
  <>
    <circle cx="8" cy="8" r="6.25" />
    <path d="M5.25 8.25l1.9 1.9 3.6-4" />
  </>,
  'IconCheckCircle',
);
export const IconStar = icon(
  <path d="M8 2l1.8 3.8 4.2.5-3.1 2.9.8 4.1L8 11.3l-3.7 2 .8-4.1L2 6.3l4.2-.5L8 2z" />,
  'IconStar',
);
export const IconBell = icon(
  <path d="M4 11.5V7a4 4 0 018 0v4.5l1 1H3l1-1zM6.5 14h3" />,
  'IconBell',
);
export const IconSettings = icon(
  <path d="M2.5 5h6M11.5 5h2M2.5 11h2M7.5 11h6M10 3.5v3M6 9.5v3" />,
  'IconSettings',
);
export const IconUsers = icon(
  <>
    <circle cx="6" cy="5.5" r="2.5" />
    <path d="M1.5 13.5a4.5 4.5 0 019 0M10.5 3.2a2.5 2.5 0 010 4.6M12 9.3a4.5 4.5 0 012.5 4.2" />
  </>,
  'IconUsers',
);
export const IconBox = icon(
  <path d="M8 1.75l5.5 3v6.5L8 14.25l-5.5-3v-6.5L8 1.75zM2.5 4.75L8 7.75l5.5-3M8 7.75v6.5" />,
  'IconBox',
);
export const IconFunnel = icon(<path d="M2.5 3.5h11M4.5 8h7M6.5 12.5h3" />, 'IconFunnel');
export const IconFlask = icon(
  <path d="M6 2h4M6.5 2v4.5L3 12.5a1 1 0 00.9 1.5h8.2a1 1 0 00.9-1.5L9.5 6.5V2M4.5 10h7" />,
  'IconFlask',
);
export const IconFile = icon(
  <path d="M4 1.75h5l3.5 3.5v8a1 1 0 01-1 1H4a1 1 0 01-1-1v-10.5a1 1 0 011-1zM9 1.75v3.5h3.5M5.5 8.5h5M5.5 11h5" />,
  'IconFile',
);
export const IconSort = icon(
  <path d="M5 3v10M2.5 10.5L5 13l2.5-2.5M11 13V3M8.5 5.5L11 3l2.5 2.5" />,
  'IconSort',
);
export const IconRefresh = icon(
  <path d="M13 8a5 5 0 01-8.9 3.1M3 8a5 5 0 018.9-3.1M12 2v3h-3M4 14v-3h3" />,
  'IconRefresh',
);
export const IconCommand = icon(
  <path d="M6 6V4.25A1.75 1.75 0 104.25 6H6zm0 0v4m0-4h4m-4 4H4.25A1.75 1.75 0 106 11.75V10zm0 0h4m0 0v1.75A1.75 1.75 0 1011.75 10H10zm0 0V6m0 0h1.75A1.75 1.75 0 1010 4.25V6z" />,
  'IconCommand',
);
export const IconSparkle = icon(
  <path d="M8 2v3M8 11v3M2 8h3M11 8h3M4 4l1.8 1.8M10.2 10.2L12 12M12 4l-1.8 1.8M5.8 10.2L4 12" />,
  'IconSparkle',
);
