import { Bot, InlineKeyboard } from "grammy";
import { uuidv7 } from "uuidv7";
import { eq } from "drizzle-orm";
import type { Db } from "../db/client.js";
import { loginNonces } from "../db/schema.js";
import { createRegistrationService } from "./registration.js";

const NONCE_TTL_MS = 15 * 60 * 1000;

export async function issueLoginNonce(db: Db, telegramUserId: string): Promise<string> {
  const nonce = uuidv7();
  await db.insert(loginNonces).values({
    nonce, telegramUserId, expiresAt: new Date(Date.now() + NONCE_TTL_MS),
  });
  return nonce;
}

export async function consumableNonceExists(db: Db, nonce: string): Promise<boolean> {
  const row = await db.query.loginNonces.findFirst({ where: eq(loginNonces.nonce, nonce) });
  return Boolean(row && !row.usedAt && row.expiresAt > new Date());
}

export interface BotDeps {
  db: Db;
  token: string;
  publicBaseUrl: string;
  bootstrapCommanderTg: string;
  notifyCommander: (text: string) => Promise<void>;
}

export function createBot(deps: BotDeps): Bot {
  const bot = new Bot(deps.token);
  const registration = createRegistrationService(deps.db, {
    bootstrapCommanderTg: deps.bootstrapCommanderTg,
  });

  bot.command("start", async (ctx) => {
    const tgId = String(ctx.from?.id ?? "");
    const existing = await deps.db.query.users.findFirst({
      where: (u, { eq: e }) => e(u.telegramUserId, tgId),
    });
    if (existing) {
      const nonce = await issueLoginNonce(deps.db, tgId);
      await ctx.reply(`Войти: ${deps.publicBaseUrl}/auth/tg?token=${nonce}`);
      return;
    }
    const allHouses = await deps.db.query.houses.findMany();
    const kb = new InlineKeyboard();
    for (const h of allHouses) kb.text(h.address, `house:${h.address}`).row();
    await ctx.reply("Регистрация. Выберите ваш дом:", { reply_markup: kb });
  });

  bot.callbackQuery(/^house:(.+)$/, async (ctx) => {
    const address = ctx.match[1]!;
    const tgId = String(ctx.from.id);
    const name = [ctx.from.first_name, ctx.from.last_name].filter(Boolean).join(" ") || "Житель";
    const res = await registration.submit({
      telegramUserId: tgId, name, claimedHouseAddress: address, phone: null,
    });
    if (res.kind === "approved") {
      const nonce = await issueLoginNonce(deps.db, tgId);
      await ctx.reply(`Вы командир. Войти: ${deps.publicBaseUrl}/auth/tg?token=${nonce}`);
    } else if (res.kind === "existing") {
      const nonce = await issueLoginNonce(deps.db, tgId);
      await ctx.reply(`Вы уже зарегистрированы. Войти: ${deps.publicBaseUrl}/auth/tg?token=${nonce}`);
    } else {
      await deps.notifyCommander(`Заявка на регистрацию: ${name}, ${address}`);
      await ctx.reply("Заявка отправлена командиру. Ожидайте одобрения.");
    }
    await ctx.answerCallbackQuery();
  });

  return bot;
}
