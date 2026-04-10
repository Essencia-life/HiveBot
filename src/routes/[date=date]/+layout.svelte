<script lang="ts">
	import { onMount, onDestroy, type Snippet } from 'svelte';
	import { on } from 'svelte/events';
	import WebApp from '@twa-dev/sdk';
	import type { PageProps } from './$types';
	import { afterNavigate, goto, preloadCode } from '$app/navigation';
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import { SvelteDate } from 'svelte/reactivity';
	import type { Attachment } from 'svelte/attachments';
	import { getBookings } from '$lib/calendar.remote';
	import ms from 'ms';
	import { swipe } from '$lib/attachments/swipe';

	interface Props extends PageProps {
		children?: Snippet;
	}

	let { children, data, params }: Props = $props();
	let refreshIntervalInstance: number;

	const startOfDay = $derived(new Date(params.date));
	const endOfDay = $derived.by(() => {
		const d = new Date(params.date);
		d.setHours(23, 59, 59, 999);
		return d;
	});

	const hours = Array.from(Array(23), (_item, index) => index + 1);
	const timeFormatter = new Intl.DateTimeFormat('pt', {
		hour: '2-digit',
		minute: '2-digit'
	});

	const now = new SvelteDate();

	$effect(() => {
		const interval = setInterval(() => {
			now.setTime(Date.now());
		}, 10_000);

		return () => {
			clearInterval(interval);
		};
	});

	function percent(date: Date) {
		const start = new Date(startOfDay);
		start.setHours(0, 0, 0, 0);

		const end = new Date(start);
		end.setHours(24, 0, 0, 0);

		const percentValue = (date.getTime() - start.getTime()) / (end.getTime() - start.getTime());
		return `${Math.min(Math.max(percentValue, 0), 1) * 100}%`;
	}

	function timeToRows(start: string, end: string) {
		const startDate = new Date(start);
		const endDate = new Date(end);

		const startTime = Math.floor(startDate.getHours() * 4 + startDate.getMinutes() / 15) + 1;
		const endTime = Math.floor(endDate.getHours() * 4 + endDate.getMinutes() / 15) + 1;

		return `${startTime} / ${endTime}`;
	}

	function isShortBooking(start: string, end: string) {
		return Date.parse(end) - Date.parse(start) < ms('45m');
	}

	function isPast(date: string) {
		return Date.parse(date) < Date.now();
	}

	const scrollIntoView: Attachment = (node) => {
		window.setTimeout(() => {
			node.scrollIntoView({ block: 'center' });
		}, 1);
	};

	function prevDay() {
		const date = new Date(Date.parse(params.date) - ms('1d')).toISOString().substring(0, 10);

		goto(resolve('/[date=date]', { date }), {
			replaceState: true,
			noScroll: true
		});
	}

	function nextDay() {
		const date = new Date(Date.parse(params.date) + ms('1d')).toISOString().substring(0, 10);

		goto(resolve('/[date=date]', { date }), {
			replaceState: true,
			noScroll: true
		});
	}

	function refreshInterval() {
		if (refreshIntervalInstance) {
			window.clearInterval(refreshIntervalInstance);
		}

		refreshIntervalInstance = window.setInterval(() => getBookings(params.date).refresh(), 30_000);
	}

	onMount(() => {
		preloadCode(resolve('/[date=date]/booking', params));

		WebApp.BackButton.onClick(() => {
			history.back();
		});

		refreshInterval();
	});

	onDestroy(() => {
		if (refreshIntervalInstance) {
			window.clearInterval(refreshIntervalInstance);
		}
	});

	on(document, 'visibilitychange', () => {
		if (refreshIntervalInstance) {
			window.clearInterval(refreshIntervalInstance);
		}

		if (document.visibilityState === 'visible') {
			getBookings(params.date).refresh();
			refreshInterval();
		}
	});

	afterNavigate((navigation) => {
		if (navigation.to?.route.id === '/[date=date]') {
			WebApp.BackButton.hide();
		} else {
			WebApp.BackButton.show();
		}
	});
</script>

<header>
	<button onclick={prevDay}>&lsaquo;</button>
	<label>
		<h2>
			{startOfDay
				.toLocaleDateString('en-gb', {
					day: '2-digit',
					month: '2-digit',
					year: '2-digit',
					weekday: 'long'
				})
				.replaceAll('/', '.')}
		</h2>
		<input
			type="date"
			value={params.date}
			oninput={(event) =>
				goto(resolve('/[date=date]', { date: event.currentTarget.value }), {
					replaceState: true,
					noScroll: true
				})}
		/>
	</label>
	<button onclick={nextDay}>&rsaquo;</button>
</header>
<main class="calendar" {@attach swipe({ threshold: 100, left: nextDay, right: prevDay })}>
	<div class="column time">
		{#each hours as hour}
			<div class="hour">
				<time>{timeFormatter.format(new Date(startOfDay).setHours(hour))}</time>
			</div>
		{/each}
	</div>
	<div class="column">
		{#each Array(24) as _}
			<div class="hour cell"></div>
		{/each}
	</div>
	<div class="column">
		{#each await getBookings(params.date) as booking (booking.id)}
			{@const isOwn =
				booking.extendedProperties?.shared?.telegramUserId === data.user.id.toString()}

			<svelte:element
				this={isOwn ? 'a' : 'div'}
				class="booking"
				class:small={isShortBooking(booking.start!.dateTime!, booking.end!.dateTime!)}
				class:past={isPast(booking.end!.dateTime!)}
				style:grid-row={timeToRows(booking.start!.dateTime!, booking.end!.dateTime!)}
				href={isOwn
					? resolve('/[date=date]/booking/[[id]]', {
							date: params.date,
							id: booking.id!
						})
					: undefined}
			>
				<b>{booking.summary}</b>
				<div>{booking.description}</div>
			</svelte:element>
		{/each}

		{#if startOfDay.getTime() < now.getTime() && now.getTime() < endOfDay.getTime()}
			<div class="now" style:--now={percent(now)} {@attach scrollIntoView}></div>
		{/if}
	</div>
</main>

<button
	class="fab"
	onclick={() => goto(resolve('/[date=date]/booking', params), { noScroll: true })}>+</button
>

{@render children?.()}

<style>
	:global(body) {
		font-family: system-ui;
		background: #efefef;
		color: #333;
		margin: 24px 6px;
	}

	header {
		position: sticky;
		top: 0;
		z-index: 1;
		display: flex;
		align-items: center;
		justify-content: space-between;
		height: 56px;
		background: #efefef;
		margin-bottom: 24px;
	}

	header label {
		position: relative;
	}

	header input {
		position: absolute;
		bottom: 0;
		max-height: 0;
		overflow: hidden;
		padding: 0;
		border: 0;
		background: transparent;
		opacity: 0;
	}

	header button {
		width: 48px;
		height: 48px;
		font-size: 32px;
		border: 0;
		padding: 0;
		background: transparent;
	}

	main {
		touch-action: pan-y;
	}

	h2 {
		font-weight: 500;
		letter-spacing: 1px;
		word-spacing: 4px;
		color: #555;
		margin: 0;
	}

	.calendar {
		--cell-size: 48px;
		--cell-gap: 6px;
		display: grid;
		grid-template-rows: repeat(96, calc(var(--cell-size) / 4));
		grid-template-columns: auto 1fr;
		gap: var(--cell-gap) 12px;
	}

	.column {
		position: relative;
		display: grid;
		grid-row: 1 / -1;
		grid-template-rows: subgrid;
		grid-column: 2;
		grid-auto-flow: row;
	}

	.column.time {
		grid-column: 1;
		grid-row: 4 / -1;
		color: #666;
		font-size: 14px;
	}

	time {
		display: block;
		transform: translateY(var(--cell-gap));
	}

	.cell {
		border-radius: 8px;
		background: #fff;
	}

	.hour {
		grid-row: span 4;
	}

	.now {
		position: absolute;
		inset-inline: 0;
		top: var(--now);
		border-top: 2px solid tomato;
		pointer-events: none;
	}

	.now::before {
		content: '';
		display: block;
		height: 8px;
		width: 8px;
		border-radius: 100%;
		background: tomato;
		margin-top: -1px;
		transform: translate(-50%, -50%);
	}

	.fab {
		appearance: none;
		position: fixed;
		bottom: 16px;
		right: 16px;
		display: flex;
		justify-content: center;
		align-items: center;
		width: 56px;
		height: 56px;
		border: 0;
		border-radius: 100%;
		padding: 0;
		background: seagreen;
		color: #fff;
		font-size: 24px;
		box-shadow: 2px 2px 6px rgba(0, 0, 0, 0.5);
	}

	.booking {
		background: slateblue;
		color: white;
		border-radius: 8px;
		padding: 8px;
		margin-right: 12px;
	}

	.booking.small {
		font-size: 80%;
	}

	.booking.past {
		opacity: 0.5;
	}

	a.booking {
		background: mediumseagreen;
		text-decoration: none;
	}

	.booking.small div {
		display: inline;
	}
</style>
