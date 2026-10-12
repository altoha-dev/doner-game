import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';
import { GrammyError, HttpError } from 'grammy';
import type { Update } from 'grammy/types';
import { createBot } from '../src/bot.js';
import { getMiniAppDeepLink } from '../src/deep-link.js';
import { describeError } from '../src/errors.js';

const previousUsername = process.env.BOT_USERNAME;

beforeEach(() => {
  process.env.BOT_USERNAME = 'doner_test_bot';
});

afterEach(() => {
  if (previousUsername === undefined) delete process.env.BOT_USERNAME;
  else process.env.BOT_USERNAME = previousUsername;
});

for (const startParam of [undefined, 'home', 'solo', 'party', 'lobby_test123']) {
  test(`deep link: ${startParam ?? 'home по умолчанию'}`, () => {
    assert.equal(
      getMiniAppDeepLink(startParam),
      `https://t.me/doner_test_bot?startapp=${startParam ?? 'home'}`,
    );
  });
}

test('username допускает @ и окружающие пробелы', () => {
  process.env.BOT_USERNAME = ' @doner_test_bot ';
  assert.equal(getMiniAppDeepLink(), 'https://t.me/doner_test_bot?startapp=home');
});

test('пустой username и URL вместо username отклоняются', () => {
  delete process.env.BOT_USERNAME;
  assert.throws(() => getMiniAppDeepLink(), /BOT_USERNAME/);
  process.env.BOT_USERNAME = 'https://t.me/doner_test_bot';
  assert.throws(() => getMiniAppDeepLink(), /BOT_USERNAME/);
});

test('параметр ссылки ограничен допустимым алфавитом и длиной', () => {
  for (const param of ['', 'solo&admin=true', 'a'.repeat(513), 'сюжет']) {
    assert.throws(() => getMiniAppDeepLink(param), /startParam/);
  }
  assert.equal(new URL(getMiniAppDeepLink('a'.repeat(512))).searchParams.get('startapp')?.length, 512);
});

async function runCommand(text: string, chatType: 'private' | 'group' | 'supergroup') {
  const bot = createBot('test-token-not-a-real-secret');
  bot.botInfo = {
    id: 1,
    is_bot: true,
    first_name: 'DONER GAME',
    username: 'doner_test_bot',
    can_join_groups: true,
    can_read_all_group_messages: false,
    supports_inline_queries: false,
    can_connect_to_business: false,
    has_main_web_app: true,
  };

  const replies: Array<Record<string, unknown>> = [];
  bot.api.config.use(async (_prev, method, payload) => {
    assert.equal(method, 'sendMessage');
    // Inspect the serialized Bot API payload, including InlineKeyboard instances.
    replies.push(JSON.parse(JSON.stringify(payload)));
    return { ok: true, result: true };
  });

  const update: Update = {
    update_id: 100,
    message: {
      message_id: 10,
      date: 0,
      from: { id: 2, is_bot: false, first_name: 'Temik' },
      chat: chatType === 'private'
        ? { id: 2, type: 'private', first_name: 'Temik' }
        : { id: -10, type: chatType, title: 'Friends' },
      text,
      entities: [{ type: 'bot_command', offset: 0, length: text.split(' ')[0]!.length }],
    },
  };

  await bot.handleUpdate(update);
  return replies;
}

test('/start показывает приветствие и URL-кнопку', async () => {
  const replies = await runCommand('/start', 'private');
  assert.equal(replies.length, 1);
  assert.equal(replies[0]?.text,
    '🍗 DONER GAME\n\nДобро пожаловать в DONER GAME.\n\nПроходи сюжет, открывай персонажей\nили играй с друзьями.');
  assert.deepEqual(replies[0]?.reply_markup, {
    inline_keyboard: [[{ text: '🎮 Открыть DONER GAME', url: getMiniAppDeepLink() }]],
  });
});

test('/help перечисляет все команды', async () => {
  const replies = await runCommand('/help', 'private');
  assert.equal(replies[0]?.text, '/start — главное меню\n/game — открыть игру\n/help — помощь');
});

for (const chatType of ['private', 'group', 'supergroup'] as const) {
  test(`/game в ${chatType} использует обычную URL-кнопку`, async () => {
    const replies = await runCommand('/game', chatType);
    assert.equal(replies.length, 1);
    assert.equal(replies[0]?.text, '🍗 DONER GAME\n\nГотов играть?');
    assert.deepEqual(replies[0]?.reply_markup, {
      inline_keyboard: [[{ text: '🎮 Открыть игру', url: getMiniAppDeepLink() }]],
    });
  });
}

test('/game@username работает в группе с privacy mode', async () => {
  assert.equal((await runCommand('/game@doner_test_bot', 'group')).length, 1);
  assert.equal((await runCommand('/game@another_bot', 'group')).length, 0);
});

test('ошибки не раскрывают содержимое запросов или токен', () => {
  const marker = 'fake-sensitive-value';
  const errors = [
    new Error(marker),
    new HttpError(`https://api.telegram.org/bot${marker}`, new Error(marker)),
    new GrammyError(marker, { ok: false, error_code: 401, description: marker }, 'getMe', {}),
  ];

  for (const error of errors) assert.equal(describeError(error).includes(marker), false);
});
