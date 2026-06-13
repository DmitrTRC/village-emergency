import { AuthProvider, useAuth } from "./auth/AuthProvider";
import { InstallPrompt } from "./components/InstallPrompt";
import { Routes } from "./routes";

function Shell() {
  const { status } = useAuth();
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
