import { useEffect } from "react";
import { AuthProvider, useAuth } from "./auth/AuthProvider";
import { Header } from "./components/Header";
import { TabBar } from "./components/TabBar";
import { drainOutbox } from "./db/sync";
import { isPublicRoute, matchRoute } from "./router/match";
import { useLocation } from "./router/router";
import { Routes } from "./routes";
import styles from "./components/AppShell.module.css";

function Shell() {
  const { status } = useAuth();
  const path = useLocation();
  const chrome = status === "authed" && !isPublicRoute(matchRoute(path));

  useEffect(() => {
    if (status !== "authed") return;
    void drainOutbox();
    const onOnline = () => void drainOutbox();
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, [status]);

  return (
    <div className={styles.shell}>
      {chrome && <Header />}
      <main className={styles.main}>
        <Routes />
      </main>
      {chrome && <TabBar />}
    </div>
  );
}

export function App() {
  return (
    <AuthProvider>
      <Shell />
    </AuthProvider>
  );
}
