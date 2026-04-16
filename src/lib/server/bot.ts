import {
	BOT_ADMIN_CHAT_ID,
	BOT_GROUP_CHAT_ID,
	BOT_TOKEN,
	BOT_WEB_APP,
	CO_WORKING_CALENDAR_ID,
	VERCEL_ENV
} from '$env/static/private';
import { Bot, GrammyError, HttpError, InlineKeyboard, InlineQueryResultBuilder } from 'grammy';
import { encryptParam } from './encryption';
import { Calendar, type CalendarEvent } from './calendar';
import { GaxiosError } from 'gaxios';
import { generateAgenda } from '$lib/server/agenda';
import { redis } from '$lib/server/redis';

export const bot = new Bot(BOT_TOKEN);

bot.on('my_chat_member', async (ctx) => {
	const { status } = ctx.myChatMember.new_chat_member;

	if (status === 'member' && ctx.chatId !== Number(BOT_GROUP_CHAT_ID)) {
		console.warn(`Chat Id ${ctx.chatId} is not allowed to use this bot.`);
		await bot.api.leaveChat(ctx.chatId);
	}
});

bot.on('inline_query', async (ctx) => {
	const coWorkingCalendar = new Calendar(CO_WORKING_CALENDAR_ID);

	if (ctx.inlineQuery.query !== '') {
		const booking = await coWorkingCalendar.getEvent(ctx.inlineQuery.query);

		if (booking) {
			return ctx.answerInlineQuery(createInlineQueryArticlesFromBookings([booking]), {
				cache_time: 0,
				is_personal: true
			});
		}
	}

	const myBookigns = await coWorkingCalendar.getEvents(
		[`telegramUserId=${ctx.from.id}`],
		new Date()
	);

	return ctx.answerInlineQuery(createInlineQueryArticlesFromBookings(myBookigns), {
		cache_time: 0,
		is_personal: true,
		button: {
			text: '🗓️ Add and manage my bookings',
			web_app: {
				url: `${BOT_WEB_APP}?user=${encryptParam(ctx.from)}`
			}
		}
	});
});

function generateBookingMessage(booking: CalendarEvent, deleted = false) {
	const startDate = new Date(booking.start!.dateTime!);
	const endDate = new Date(booking.end!.dateTime!);

	const tgTime = (date: Date, text: string) =>
		deleted ? text : `<tg-time unix="${date.getTime() / 1000}">${text}</tg-time>`;
	const strikethrough = (text: string) => (deleted ? `<s>${text}</s>` : text);

	const time = `${startDate
		.toLocaleDateString('en-gb', {
			weekday: 'long',
			day: '2-digit',
			month: '2-digit',
			year: '2-digit',
			timeZone: 'Europe/Lisbon'
		})
		.replaceAll('/', '.')}\n${startDate.toLocaleTimeString('en-gb', {
			hour: '2-digit',
			minute: '2-digit',
			hour12: false,
			timeZone: 'Europe/Lisbon'
		})} – ${endDate.toLocaleTimeString('en-gb', {
			hour: '2-digit',
			minute: '2-digit',
			hour12: false,
			timeZone: 'Europe/Lisbon'
		})}`;

	return strikethrough(
		`💻 I booked the Hive for ${booking.description}\n\non ${tgTime(startDate, time)}`
	);
}

export async function updateInlineMessage(
	inlineMessageId: string,
	event: CalendarEvent,
	deleted = false
) {
	const text = generateBookingMessage(event, deleted);

	try {
		await bot.api.editMessageTextInline(inlineMessageId, text, {
			parse_mode: 'HTML',
			reply_markup: new InlineKeyboard().switchInlineCurrent('Manage bookings')
		});
	} catch (err) {
		console.error('Failed to update inline message:', err);
	}
}

export async function updateAgenda(event: CalendarEvent) {
	const today = new Date();
	const start = new Date(event.start!.dateTime!);

	if (
		today.getDate() === start.getDate() &&
		today.getMonth() === start.getMonth() &&
		today.getFullYear() === start.getFullYear()
	) {
		const messageId = await redis.get<number>(`essencia:${VERCEL_ENV}:hiveBotAgendaMessageId`);

		console.log(messageId);

		if (!messageId) {
			return;
		}

		const text = await generateAgenda();

		if (text) {
			return bot.api.editMessageText(BOT_GROUP_CHAT_ID, messageId, text, {
				parse_mode: 'HTML',
				reply_markup: new InlineKeyboard().switchInlineCurrent('Manage bookings')
			});
		}

		return bot.api.deleteMessage(BOT_GROUP_CHAT_ID, messageId);
	}
}

function createInlineQueryArticlesFromBookings(bookings: CalendarEvent[]) {
	return bookings.map((booking) => {
		const startDate = new Date(booking.start!.dateTime!);
		const endDate = new Date(booking.end!.dateTime!);

		const title =
			startDate
				.toLocaleString('en-gb', {
					dateStyle: 'short',
					timeStyle: 'short',
					timeZone: 'Europe/Lisbon'
				})
				.replaceAll('/', '.') +
			' - ' +
			endDate.toLocaleTimeString('en-gb', {
				hour: '2-digit',
				minute: '2-digit',
				hour12: false,
				timeZone: 'Europe/Lisbon'
			});

		const message = generateBookingMessage(booking);

		return InlineQueryResultBuilder.article(booking.id!, title, {
			description: 'Click here to post your booking to this chat.',
			thumbnail_url: 'https://emojiapi.dev/api/v1/laptop/96.png',
			thumbnail_height: 96,
			thumbnail_width: 96,
			reply_markup: new InlineKeyboard().switchInlineCurrent('Manage bookings')
		}).text(message, {
			parse_mode: 'HTML'
		});
	});
}

bot.on('chosen_inline_result', async (ctx) => {
	const coWorkingCalendar = new Calendar(CO_WORKING_CALENDAR_ID);
	await coWorkingCalendar.updateEvent(ctx.chosenInlineResult.result_id, {
		extendedProperties: {
			private: {
				telegramInlineMessageId: String(ctx.chosenInlineResult.inline_message_id)
			}
		}
	});
});

bot.catch(async (err) => {
	const ctx = err.ctx;
	const e = err.error;

	let message = `🚨 * Bot Error *\n`;

	message += `\n• Environment: \`${VERCEL_ENV}\``;

	if (ctx) {
		message += `\n• Update ID: \`${ctx.update.update_id}\``;
		if (ctx.chat) message += `\n• Chat ID: \`${ctx.chat.id}\``;
		if (ctx.from) message += `\n• User ID: \`${ctx.from.id} (${ctx.from.first_name})\``;
	}

	if (e instanceof GrammyError) {
		message += `\n\n*GrammyError*\n\`${e.description}\``;
	} else if (e instanceof HttpError) {
		message += `\n\n*HttpError*\n\`${String(e.error)}\``;
	} else if (e instanceof GaxiosError) {
		message += `\n\n*GaxiosError*\n\`${String(e.code)} ${String(e.message)}\``;
	} else {
		message += `\n\n*Unknown Error*\n\`${String(e)}\``;
	}

	const stack =
		e instanceof Error && e.stack
			? e.stack.slice(0, 3500) // Telegram Limit-Schutz
			: 'no stacktrace';

	message += `\n\n*Stacktrace*\n\`\`\`\n${stack}\n\`\`\``;

	try {
		console.error(err);
		await bot.api.sendMessage(BOT_ADMIN_CHAT_ID, message, {
			parse_mode: 'Markdown',
			link_preview_options: {
				is_disabled: true
			}
		});
	} catch (err) {
		console.error(err);
	}
});
