// Inline SVG icons: paths only (no SVG text elements, no font or network dependency), coloured by CSS through
// currentColor or classes, decorative (aria-hidden): the visible label always carries the meaning.

function Icon({ d }: { d: string }) {
  return (
    <svg className="icon" viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" focusable="false">
      <path d={d} />
    </svg>
  );
}

/** Logo mark: ink tile, ticket outline, sky check (the same drawing as the installed app icon). */
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

/** Wordmark lockup used by the header and the footer. */
export function Brand() {
  return (
    <>
      <BrandMark />
      <span className="brand-word">
        reventa<b>segura</b>
      </span>
    </>
  );
}

/** Outline of a ticket with its perforation: the mark of empty states. */
export function TicketMark() {
  return (
    <svg className="empty-mark" viewBox="0 0 56 40" aria-hidden="true" focusable="false">
      <path d="M6 4H50A4 4 0 0 1 54 8V14A6 6 0 0 0 54 26V32A4 4 0 0 1 50 36H6A4 4 0 0 1 2 32V26A6 6 0 0 0 2 14V8A4 4 0 0 1 6 4Z" />
      <path className="perf" d="M38 7V33" />
      <path d="M12 15H28M12 21H22" />
    </svg>
  );
}

export const IconEvents = () => <Icon d="M4 8a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v1.5a2.5 2.5 0 0 0 0 5V16a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-1.5a2.5 2.5 0 0 0 0-5zM9.5 10.5l2 2 3.5-3.6" />;
export const IconCalendar = () => <Icon d="M7 3v3M17 3v3M4 10h16M6 5h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z" />;
export const IconSearch = () => <Icon d="M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-4-4" />;
export const IconClose = () => <Icon d="M6 6l12 12M18 6L6 18" />;
export const IconChevronLeft = () => <Icon d="M15 5l-7 7 7 7" />;
export const IconChevronRight = () => <Icon d="M9 5l7 7-7 7" />;
export const IconChevronDown = () => <Icon d="M5 9l7 7 7-7" />;
export const IconWallet = () => <Icon d="M4 7a2 2 0 0 1 2-2h11a1 1 0 0 1 1 1v2M4 7v11a2 2 0 0 0 2 2h13a1 1 0 0 0 1-1v-3M4 7a2 2 0 0 0 2 2h13a1 1 0 0 1 1 1v3M20 13h-4a2 2 0 0 0 0 4h4" />;
export const IconOrders = () => <Icon d="M6 3h12a1 1 0 0 1 1 1v17l-3-2-2 2-2-2-2 2-2-2-3 2V4a1 1 0 0 1 1-1zM9 8h6M9 12h6" />;
export const IconSell = () => (
  <Icon d="M3 12.2V5a2 2 0 0 1 2-2h7.2a2 2 0 0 1 1.4.6l7.8 7.8a2 2 0 0 1 0 2.8l-7.2 7.2a2 2 0 0 1-2.8 0l-7.8-7.8A2 2 0 0 1 3 12.2zM8 8h.01" />
);
export const IconAdmin = () => <Icon d="M12 3l7 3v5.5c0 4.3-2.9 8-7 9.5-4.1-1.5-7-5.2-7-9.5V6z" />;
export const IconUser = () => <Icon d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4.5 21a7.5 7.5 0 0 1 15 0" />;
export const IconLogout = () => <Icon d="M10 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4M15 16l4-4-4-4M19 12H9" />;
export const IconArrowRight = () => <Icon d="M5 12h14M13 6l6 6-6 6" />;
export const IconArrowUpRight = () => <Icon d="M7 17L17 7M8 7h9v9" />;
export const IconArrowDown = () => <Icon d="M12 5v14M6 13l6 6 6-6" />;
export const IconShieldCheck = () => <Icon d="M12 3l7 3v5.5c0 4.3-2.9 8-7 9.5-4.1-1.5-7-5.2-7-9.5V6zM9 12l2 2 4-4" />;
export const IconSun = () => (
  <Icon d="M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 2.5v2M12 19.5v2M4.6 4.6l1.4 1.4M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4L6 18M18 6l1.4-1.4" />
);
export const IconMoon = () => <Icon d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" />;
export const IconMonitor = () => <Icon d="M5 4h14a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zM8.5 21h7M12 17v4" />;
