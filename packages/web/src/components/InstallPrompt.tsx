import { useEffect, useState } from "react";
import { subscribePush } from "../push/subscribe";

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export function InstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => setDeferred(null);
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const install = async () => {
    if (!deferred) return;
    await deferred.prompt();
    setDeferred(null);
  };

  const enablePush = async () => {
    setPushBusy(true);
    try {
      setPushEnabled(await subscribePush());
    } finally {
      setPushBusy(false);
    }
  };

  return (
    <div className="actions" data-testid="install-prompt">
      {deferred && (
        <button type="button" className="btn" onClick={() => void install()}>
          Добавить на экран
        </button>
      )}
      {pushEnabled ? (
        <span>Уведомления включены</span>
      ) : (
        <button type="button" className="btn" onClick={() => void enablePush()} disabled={pushBusy}>
          Включить уведомления
        </button>
      )}
    </div>
  );
}
