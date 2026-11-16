// Inline SVG icons: paths only (no SVG text elements, no font or network dependency), coloured by CSS through
// currentColor or classes, decorative (aria-hidden): the visible label always carries the meaning.

function Icon({ d }: { d: string }) {
  return (
    <svg className="icon" viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" focusable="false">
      <path d={d} />
    </svg>
  );
}

/** Logo mark: ink tile, ticket outline, sky check. Colours come from the --mark-* tokens. */
export function BrandMark() {
  return (
    <svg className="brand-mark" viewBox="0 0 32 32" width="32" height="32" aria-hidden="true" focusable="false">
      <path className="mark-bg" d="M8 0H24A8 8 0 0 1 32 8V24A8 8 0 0 1 24 32H8A8 8 0 0 1 0 24V8A8 8 0 0 1 8 0Z" />
      <path
        className="mark-ticket"
        d="M8.5 9H23.5A2.5 2.5 0 0 1 26 11.5V13.4A2.6 2.6 0 0 0 26 18.6V20.5A2.5 2.5 0 0 1 23.5 23H8.5A2.5 2.5 0 0 1 6 20.5V18.6A2.6 2.6 0 0 0 6 13.4V11.5A2.5 2.5 0 0 1 8.5 9Z"
      />
      <path className="mark-check" d="M12 16.2L14.8 19L20.2 13.2" />
    </svg>
  );
}

export const IconEvents = () => <Icon d="M4 10.5L12 4l8 6.5V19a1 1 0 0 1-1 1h-4.5v-5.5h-5V20H5a1 1 0 0 1-1-1z" />;
export const IconCalendar = () => <Icon d="M7 3v3M17 3v3M4 10h16M6 5h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z" />;
export const IconSearch = () => <Icon d="M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-4-4" />;
export const IconChevronLeft = () => <Icon d="M15 5l-7 7 7 7" />;
export const IconChevronRight = () => <Icon d="M9 5l7 7-7 7" />;
export const IconChevronDown = () => <Icon d="M5 9l7 7 7-7" />;
export const IconWallet = () => <Icon d="M4 7a2 2 0 0 1 2-2h11a1 1 0 0 1 1 1v2M4 7v11a2 2 0 0 0 2 2h13a1 1 0 0 0 1-1v-3M4 7a2 2 0 0 0 2 2h13a1 1 0 0 1 1 1v3M20 13h-4a2 2 0 0 0 0 4h4" />;
export const IconOrders = () => (
  <Icon d="M4 8a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v1.5a2.5 2.5 0 0 0 0 5V16a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-1.5a2.5 2.5 0 0 0 0-5zM14.5 6v2M14.5 11v2M14.5 16v2" />
);
export const IconSell = () => (
  <Icon d="M3 12.2V5a2 2 0 0 1 2-2h7.2a2 2 0 0 1 1.4.6l7.8 7.8a2 2 0 0 1 0 2.8l-7.2 7.2a2 2 0 0 1-2.8 0l-7.8-7.8A2 2 0 0 1 3 12.2zM8 8h.01" />
);
export const IconAdmin = () => <Icon d="M12 3l7 3v5.5c0 4.3-2.9 8-7 9.5-4.1-1.5-7-5.2-7-9.5V6z" />;
export const IconUser = () => <Icon d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4.5 21a7.5 7.5 0 0 1 15 0" />;
export const IconLogout = () => <Icon d="M10 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4M15 16l4-4-4-4M19 12H9" />;
export const IconArrowRight = () => <Icon d="M5 12h14M13 6l6 6-6 6" />;
export const IconShieldCheck = () => <Icon d="M12 3l7 3v5.5c0 4.3-2.9 8-7 9.5-4.1-1.5-7-5.2-7-9.5V6zM9 12l2 2 4-4" />;
