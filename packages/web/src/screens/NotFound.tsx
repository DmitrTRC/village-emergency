import { Link } from "../router/router";
import styles from "./auth.module.css";

export function NotFound() {
  return (
    <section className={styles.wrap}>
      <h1>Не найдено</h1>
      <Link className={styles.cta} to="/">К ленте</Link>
    </section>
  );
}
