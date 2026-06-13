import { config } from "../config";
import { useOnlineStatus } from "../hooks/useOnlineStatus";
import styles from "./Header.module.css";

export function Header() {
  const online = useOnlineStatus();
  return (
    <header className={styles.header}>
      <span className={styles.village}>{config.villageName}</span>
      <span className={styles.net} data-online={online} data-testid="net-status">
        <span className={styles.dot} />
        {online ? "онлайн" : "офлайн"}
      </span>
    </header>
  );
}
