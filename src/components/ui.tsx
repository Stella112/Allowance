"use client";

import { createPortal } from "react-dom";

/* Shared app pieces: line icons, the bottom tab bar and the feed item used by every in-app screen. */

const paths = {
  home: "M4 11l8-7 8 7v8a1 1 0 0 1-1 1h-4v-6H9v6H5a1 1 0 0 1-1-1z",
  chart: "M4 19h16M7 16v-5M12 16V6M17 16v-8",
  target: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 12h.01",
  sun: "M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10zM12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4",
  kids: "M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM2 21v-1a6 6 0 0 1 6-6h2a6 6 0 0 1 6 6v1M16 3.5a4 4 0 0 1 0 7M18 14.5a6 6 0 0 1 4 5.5v1",
  gift: "M4 12v8a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-8M3 8h18v4H3zM12 8v13M12 8S10.5 3 7.5 3a2.5 2.5 0 0 0 0 5zM12 8s1.5-5 4.5-5a2.5 2.5 0 0 1 0 5z",
  phone: "M8 2h8a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zM11 18h2",
} as const;

export type IconName = keyof typeof paths;

export function Icon({ name, className = "h-6 w-6" }: { name: IconName; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={paths[name]} />
    </svg>
  );
}

export type TabItem<T extends string> = { id: T; label: string; icon: React.ReactNode; badge?: number };

/** The bottom tab bar. It's rendered on the page body so it stays pinned while the screen scrolls. */
export function TabBar<T extends string>({ items, active, onPick, label }: { items: TabItem<T>[]; active: T; onPick: (id: T) => void; label: string }) {
  return createPortal(
    <nav aria-label={label} className="tabbar">
      <div className="tabbar-inner" style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}>
        {items.map((t) => (
          <button key={t.id} type="button" className="tab" aria-current={active === t.id ? "page" : undefined} onClick={() => onPick(t.id)}>
            <span className="tab-icon">
              {t.icon}
              {!!t.badge && <span className="tab-badge">{t.badge}</span>}
            </span>
            {t.label}
          </button>
        ))}
      </div>
    </nav>,
    document.body,
  );
}

/** One line of a Morning Report: an icon tile, a headline, then anything else below it. */
export function FeedItem({ icon, title, children }: { icon: string; title: React.ReactNode; children?: React.ReactNode }) {
  return (
    <article className="card">
      <div className="flex gap-3">
        <span className="tile" aria-hidden>
          {icon}
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-extrabold leading-snug">{title}</p>
          {children}
        </div>
      </div>
    </article>
  );
}
