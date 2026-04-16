import { dev } from '$app/environment';
import { bot } from '$lib/server/bot';
import { GrammyError } from 'grammy';

if (dev) {
	bot.start().catch((err) => {
		if (
			!(
				err instanceof GrammyError &&
				(err.error_code === 409 || err.description.includes('query is too old'))
			)
		) {
			throw err;
		}
	}).then(() => {
		void bot.api.setMyShortDescription('development');
	});
}