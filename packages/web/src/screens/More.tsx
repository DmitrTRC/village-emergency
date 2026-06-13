import type { Role } from "@village/shared";
import { useAuth } from "../auth/AuthProvider";
import { InstallPrompt } from "../components/InstallPrompt";
import { useOnlineStatus } from "../hooks/useOnlineStatus";
import styles from "./More.module.css";

const ROLE_LABEL: Record<Role, string> = {
  commander: "Командир",
  resident: "Житель",
};

export function More() {
  const { user, signOut } = useAuth();
  const online = useOnlineStatus();

  return (
    <section className={styles.wrap}>
      <h1 className={styles.title}>Ещё</h1>
      <div className={styles.row}>
        <span className={styles.key}>Роль</span>
        <span>{user ? ROLE_LABEL[user.role] : "—"}</span>
      </div>
      <div className={styles.row}>
        <span className={styles.key}>Сеть</span>
        <span>{online ? "онлайн" : "офлайн"}</span>
      </div>
      <InstallPrompt />
      <button type="button" className={styles.signout} onClick={() => void signOut()}>
        Выйти
      </button>
    </section>
  );
}
