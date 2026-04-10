import type { RequestHandler } from './$types';
import { bot } from '$lib/server/bot';
import { InlineKeyboard } from 'grammy';
import { Calendar, type CalendarEvent } from '$lib/server/calendar';
import { HIVE_CALENDAR_ID, BOT_GROUP_CHAT_ID, BOT_TOPIC_ID } from '$env/static/private';

const HIVE_CALENDAR = new Calendar(HIVE_CALENDAR_ID);

function buildIsoRangeForToday() {
    const now = new Date();
    const lisbonTime = new Date(now.toLocaleString('en-US', { timeZone: 'Europe/Lisbon' }));

    const start = new Date(lisbonTime);
    start.setHours(0, 0, 0, 0);

    const end = new Date(lisbonTime);
    end.setHours(23, 59, 59, 999);

    return { start, end };
}

function escapeHtml(value: string) {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function formatEvent(event: CalendarEvent) {
    const start = event.start?.dateTime ?? event.start?.date;
    const end = event.end?.dateTime ?? event.end?.date;

    const startDate = start ? new Date(start) : undefined;
    const endDate = end ? new Date(end) : undefined;

    const timeString = startDate && endDate
        ? `<tg-time unix="${Math.floor(startDate.getTime() / 1000)}">${startDate.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Lisbon' })} – ${endDate.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Lisbon' })}</tg-time>`
        : '';

    const title = escapeHtml(event.summary);
    const description = event.description ? escapeHtml(event.description) : '';

    return `<blockquote>${timeString}\n<b>${title}</b> ${description}</blockquote>`;
}

export const GET: RequestHandler = async () => {
    console.info('agenda GET: fetching today events for hive calendar');
    const { start, end } = buildIsoRangeForToday();

    const events = await HIVE_CALENDAR.getEvents([], start, end);
    console.info('agenda GET: found', events.length, 'events');

    if (events.length === 0) {
        console.info('agenda GET: no events, returning 204 without sending message');
        return new Response(null, { status: 204 });
    }

    const text = `<b>Today's Hive Bookings:</b>\n\n${events.map(formatEvent).join('\n')}`;
    console.info('agenda GET: sending message to telegram group', BOT_GROUP_CHAT_ID, 'topic', BOT_TOPIC_ID);

    const message = await bot.api.sendMessage(BOT_GROUP_CHAT_ID, text, {
        parse_mode: 'HTML',
        message_thread_id: Number(BOT_TOPIC_ID),
        reply_markup: new InlineKeyboard().switchInlineCurrent('Manage bookings')
    });

    // TODO store message id and update agenda if todays bookings change

    console.info('agenda GET: message sent successfully');
    return new Response(null, { status: 201 });
};
