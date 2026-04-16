import { dev } from '$app/environment';
import { bot } from '$lib/server/bot';
import { GrammyError } from 'grammy';

if (dev) {
	bot
		.start({
			onStart: async () => {
				await bot.api.setMyShortDescription('development');
			}
		})
		.catch((err) => {
			if (!(err instanceof GrammyError && err.error_code === 409)) {
				console.error(err);
			}
		});
}
