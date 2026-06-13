import { useEffect } from "react";
import { AuthProvider, useAuth } from "./auth/AuthProvider";
import { InstallPrompt } from "./components/InstallPrompt";
import { drainOutbox } from "./db/sync";
import { Routes } from "./routes";

function Shell() {
  const { status } = useAuth();

  useEffect(() => {
    if (status !== "authed") return;
    void drainOutbox();
    const onOnline = () => void drainOutbox();
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, [status]);

  return (
    <main>
      {status === "authed" && <InstallPrompt />}
      <Routes />
    </main>
  );
}

export function App() {
  return (
    <AuthProvider>
      <Shell />
    </AuthProvider>
  );
}
