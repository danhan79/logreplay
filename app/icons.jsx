// Tiny inline SVG icons. Stroke-based so they tint with currentColor.

const Icon = {
  play:  (p={}) => <svg width="12" height="12" viewBox="0 0 12 12" {...p}><path d="M3 2 L10 6 L3 10 Z" fill="currentColor"/></svg>,
  pause: (p={}) => <svg width="12" height="12" viewBox="0 0 12 12" {...p}>
    <rect x="3" y="2" width="2.5" height="8" fill="currentColor"/>
    <rect x="6.5" y="2" width="2.5" height="8" fill="currentColor"/>
  </svg>,
  prev:  (p={}) => <svg width="12" height="12" viewBox="0 0 12 12" {...p}>
    <rect x="2" y="2" width="1.5" height="8" fill="currentColor"/>
    <path d="M11 2 L4 6 L11 10 Z" fill="currentColor"/>
  </svg>,
  next:  (p={}) => <svg width="12" height="12" viewBox="0 0 12 12" {...p}>
    <rect x="8.5" y="2" width="1.5" height="8" fill="currentColor"/>
    <path d="M1 2 L8 6 L1 10 Z" fill="currentColor"/>
  </svg>,
  search:(p={}) => <svg width="13" height="13" viewBox="0 0 13 13" fill="none" {...p}>
    <circle cx="5.5" cy="5.5" r="3.5" stroke="currentColor" strokeWidth="1.3"/>
    <path d="M8.2 8.2 L11 11" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
  </svg>,
  close: (p={}) => <svg width="12" height="12" viewBox="0 0 12 12" fill="none" {...p}>
    <path d="M2.5 2.5 L9.5 9.5 M9.5 2.5 L2.5 9.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
  </svg>,
  chevDown:(p={}) => <svg width="10" height="10" viewBox="0 0 10 10" fill="none" {...p}>
    <path d="M2 4 L5 7 L8 4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>,
  refresh:(p={}) => <svg width="13" height="13" viewBox="0 0 13 13" fill="none" {...p}>
    <path d="M11 6.5 A4.5 4.5 0 1 1 6.5 2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
    <path d="M11 2 L11 5 L8 5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>,
  step10:(p={}) => <svg width="13" height="13" viewBox="0 0 13 13" fill="none" {...p}>
    <path d="M1.5 6.5 L5 6.5 M3.5 4.5 L1.5 6.5 L3.5 8.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
    <text x="6.5" y="9" fontSize="6" fontFamily="IBM Plex Mono, monospace" fill="currentColor">10</text>
  </svg>,
};

window.Icon = Icon;
