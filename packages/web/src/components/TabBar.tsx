import { Link, useLocation } from "../router/router";
import styles from "./TabBar.module.css";

const TABS = [
  { to: "/", label: "Лента", icon: "▤" },
  { to: "/map", label: "Карта", icon: "◍" },
  { to: "/mine", label: "Мои", icon: "◷" },
  { to: "/more", label: "Ещё", icon: "☰" },
] as const;

export function TabBar() {
  const path = useLocation();
  return (
    <nav className={styles.tabs} aria-label="Навигация">
      {TABS.map((t) => {
        const active = path === t.to;
        return (
          <Link
            key={t.to}
            to={t.to}
            className={styles.tab}
            data-active={active}
            aria-current={active ? "page" : undefined}
          >
            <span className={styles.icon} aria-hidden="true">{t.icon}</span>
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
