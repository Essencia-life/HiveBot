import { bot } from '$lib/server/bot';
import { webhookCallback } from 'grammy';
import type { RequestHandler } from './$types';
import { BOT_SECRET_TOKEN } from '$env/static/private';
import { error } from '@sveltejs/kit';

export const POST = webhookCallback(bot, 'sveltekit', {
	secretToken: BOT_SECRET_TOKEN
});

export const PUT: RequestHandler = async ({ url }) => {
	await bot.api.deleteWebhook();
	const success = await bot.api.setWebhook(url.toString(), {
		secret_token: BOT_SECRET_TOKEN,
		allowed_updates: [
			// 'message',
			// 'edited_message',
			// "channel_post",
			// "edited_channel_post",
			// "business_connection",
			// "business_message",
			// "edited_business_message",
			// "deleted_business_messages",
			"inline_query",
			"chosen_inline_result",
			// 'callback_query',
			// "shipping_query",
			// "pre_checkout_query",
			// "purchased_paid_media",
			// "poll",
			// "poll_answer",
			// 'chat_member',
			'my_chat_member'
			// "chat_join_request",
			// "chat_boost",
			// "removed_chat_boost",
		]
	});

	if (!success) {
		error(500, 'Failed setting webhook');
	}

	return new Response(null, { status: 201 });
};
