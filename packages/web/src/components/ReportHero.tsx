import { Link } from "../router/router";
import { PanicButton } from "./PanicButton";
import styles from "./ReportHero.module.css";

export function ReportHero() {
  return (
    <div className={styles.hero}>
      <PanicButton />
      <p className={styles.hint}>нажмите и держите при опасности</p>
      <Link className={`btn btn-outline btn-block ${styles.calm}`} to="/new">
        Сообщить о другом
      </Link>
    </div>
  );
}
