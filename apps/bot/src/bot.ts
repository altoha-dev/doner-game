import { Bot, InlineKeyboard } from 'grammy';
import { getMiniAppDeepLink } from './deep-link.js';
import { describeError } from './errors.js';

export function createBot(token: string): Bot {
  const bot = new Bot(token);

  bot.command('start', async (ctx) => {
    await ctx.reply(
      '🍗 DONER GAME\n\nДобро пожаловать в DONER GAME.\n\nПроходи сюжет, открывай персонажей\nили играй с друзьями.',
      {
        reply_markup: new InlineKeyboard().url(
          '🎮 Открыть DONER GAME',
          getMiniAppDeepLink(),
        ),
      },
    );
  });

  bot.command('help', async (ctx) => {
    await ctx.reply('/start — главное меню\n/game — открыть игру\n/help — помощь');
  });

  // A regular URL button works in private chats AND groups.
  // Telegram's web_app inline buttons are restricted to private bot chats.
  bot.command('game', async (ctx) => {
    await ctx.reply('🍗 DONER GAME\n\nГотов играть?', {
      reply_markup: new InlineKeyboard().url('🎮 Открыть игру', getMiniAppDeepLink()),
    });
  });

  bot.catch(({ error, ctx }) => {
    console.error(`Update ${ctx.update.update_id}: ${describeError(error)}`);
  });

  return bot;
}
