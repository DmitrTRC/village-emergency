import { useEffect, useState } from "react";
import { exchangeToken } from "../api/endpoints";
import { useAuth } from "../auth/AuthProvider";
import { Link, navigate } from "../router/router";
import styles from "./auth.module.css";

export function AuthCallback() {
  const { setSession } = useAuth();
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get("token");
    if (!token) {
      setFailed(true);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const { accessToken, refreshToken, user } = await exchangeToken(token);
        await setSession({ accessToken, refreshToken }, user);
        if (!cancelled) navigate("/");
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (failed) {
    return (
      <section className={styles.wrap}>
        <h1>Не удалось войти</h1>
        <Link className={styles.cta} to="/register">К регистрации</Link>
      </section>
    );
  }

  return (
    <section className={styles.wrap}>
      <h1>Вход…</h1>
    </section>
  );
}
