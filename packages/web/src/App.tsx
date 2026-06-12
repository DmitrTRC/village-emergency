import { AuthProvider } from "./auth/AuthProvider";
import { Routes } from "./routes";

export function App() {
  return (
    <AuthProvider>
      <main>
        <Routes />
      </main>
    </AuthProvider>
  );
}
