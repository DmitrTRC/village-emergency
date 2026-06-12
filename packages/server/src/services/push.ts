import webpush from "web-push";
import type { IncidentLevel, NotifyPrefs, Role } from "@village/shared";

export interface PushUser {
  id: string;
  role: Role;
  pushSubscription: unknown;
  notifyPrefs: NotifyPrefs;
}

export interface VapidConfig { publicKey: string; privateKey: string; subject: string; }

export function computePushTargets(users: PushUser[], level: IncidentLevel): PushUser[] {
  return users.filter((u) => {
    if (!u.pushSubscription) return false;
    if (u.role === "commander") return true;
    if (level === "emergency") return true;
    if (level === "offence") return u.notifyPrefs.offence;
    return u.notifyPrefs.attention;
  });
}

export function createPushService(cfg: VapidConfig) {
  webpush.setVapidDetails(cfg.subject, cfg.publicKey, cfg.privateKey);

  async function send(user: PushUser, payload: { title: string; body: string; url: string }): Promise<boolean> {
    try {
      await webpush.sendNotification(
        user.pushSubscription as webpush.PushSubscription,
        JSON.stringify(payload),
      );
      return true;
    } catch {
      return false;
    }
  }

  async function broadcast(
    users: PushUser[], level: IncidentLevel,
    payload: { title: string; body: string; url: string },
  ): Promise<number> {
    const targets = computePushTargets(users, level);
    const results = await Promise.all(targets.map((u) => send(u, payload)));
    return results.filter(Boolean).length;
  }

  return { send, broadcast };
}
