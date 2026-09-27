/**
 * Hand-drawn icon set.
 *
 * Everything is inline SVG on `currentColor` — no icon font, no sprite fetch, no
 * CDN. The shapes are geometric rather than rounded so they sit with the
 * instrument look of the board. Icons are decorative: every one is paired with a
 * visible text label or an aria-label on its control.
 */
import type { SVGProps } from 'react';

export interface IconProps extends Omit<SVGProps<SVGSVGElement>, 'children'> {
  size?: number;
}

function Svg({ size = 18, ...rest }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    />
  );
}

export function IconLens(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="10.5" r="6" />
      <path d="M8.2 16.4 6 21M15.8 16.4 18 21" />
      <path d="M9.4 10.5a2.6 2.6 0 0 1 2.6-2.6" />
    </Svg>
  );
}

export function IconLock(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="4.5" y="10.5" width="15" height="9.5" />
      <path d="M8 10.5V7.8a4 4 0 0 1 8 0v2.7" />
      <path d="M12 14.4v2.4" />
    </Svg>
  );
}

export function IconGate(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4 4v16M20 4v16" />
      <path d="M8 5v14M12 5v14M16 5v14" />
    </Svg>
  );
}

export function IconWave(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M2.5 8.5c2-2 3.5-2 5.5 0s3.5 2 5.5 0 3.5-2 5.5 0" />
      <path d="M2.5 14c2-2 3.5-2 5.5 0s3.5 2 5.5 0 3.5-2 5.5 0" />
      <path d="M2.5 19.5c2-2 3.5-2 5.5 0s3.5 2 5.5 0 3.5-2 5.5 0" />
    </Svg>
  );
}

export function IconBeacon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 3v2.4" />
      <path d="M5.6 6.4 7.4 8.2M18.4 6.4 16.6 8.2" />
      <path d="M4 21h16" />
      <path d="M9 21V13.5h6V21" />
      <circle cx="12" cy="10.6" r="1.5" />
    </Svg>
  );
}

export function IconHull(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4 8.5 12 4l8 4.5v7L12 20l-8-4.5z" />
      <path d="M12 11.6v8.2M4.4 8.6 12 12l7.6-3.4" />
    </Svg>
  );
}

export function IconBolt(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M13.4 3 6.5 13.2h4.3L10 21l7.1-10.4h-4.5z" />
    </Svg>
  );
}

export function IconTarget(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="3.4" />
      <path d="M12 2v2.6M12 19.4V22M2 12h2.6M19.4 12H22" />
    </Svg>
  );
}

export function IconRefresh(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M20 12a8 8 0 1 1-2.6-5.9" />
      <path d="M20 4v4.4h-4.4" />
    </Svg>
  );
}

export function IconClose(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M6 6l12 12M18 6L6 18" />
    </Svg>
  );
}

export function IconCopy(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="9" y="9" width="11" height="11" />
      <path d="M15 9V5.5A1.5 1.5 0 0 0 13.5 4h-8A1.5 1.5 0 0 0 4 5.5v8A1.5 1.5 0 0 0 5.5 15H9" />
    </Svg>
  );
}

export function IconCheck(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4.5 12.6 9.4 17.5 19.5 6.8" />
    </Svg>
  );
}

export function IconExternal(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M14 4h6v6" />
      <path d="M20 4 11 13" />
      <path d="M18 14.5V19a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h4.5" />
    </Svg>
  );
}

export function IconAlert(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 3.6 21 19.5H3z" />
      <path d="M12 9.4v4.6M12 16.7v.1" />
    </Svg>
  );
}

export function IconHelp(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="8.6" />
      <path d="M9.6 9.6a2.5 2.5 0 1 1 3.4 2.3c-.7.3-1 .9-1 1.6v.4" />
      <path d="M12 17v.1" />
    </Svg>
  );
}

export function IconGauge(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M3.6 18a9 9 0 1 1 16.8 0" />
      <path d="M12 18 16 9.4" />
      <circle cx="12" cy="18" r="1.4" />
    </Svg>
  );
}

export function IconArrowRight(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4 12h15" />
      <path d="M13.4 6.6 19 12l-5.6 5.4" />
    </Svg>
  );
}

export function IconShift(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4 8h9.5" />
      <path d="M11 5 14 8l-3 3" />
      <path d="M20 16h-9.5" />
      <path d="M13 13l-3 3 3 3" />
    </Svg>
  );
}

export function IconLayers(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 3.5 20.5 8 12 12.5 3.5 8z" />
      <path d="M3.5 12.4 12 16.9l8.5-4.5" />
      <path d="M3.5 16.6 12 21.1l8.5-4.5" />
    </Svg>
  );
}
