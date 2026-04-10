<script lang="ts">
	import WebApp from '@twa-dev/sdk';
	import {
		checkAvailability,
		createBooking,
		deleteBooking,
		updateBooking
	} from '$lib/calendar.remote';
	import type { PageProps } from './$types';
	import type { Attachment } from 'svelte/attachments';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { SvelteDate } from 'svelte/reactivity';
	import ms from 'ms';
	import type { TimePeriod } from '$lib/server/calendar';

	const { params, data }: PageProps = $props();

	const now = new SvelteDate();
	const today = $derived(now.toISOString().substring(0, 10));
	const nowTime = $derived(now.toISOString().substring(11, 14) + '00');
	const step = 900;

	let date = $derived(params.date);
	let startTime = $derived(
		data.booking?.start?.dateTime
			? new Date(data.booking.start.dateTime).toLocaleTimeString('en', {
					hour12: false,
					hour: '2-digit',
					minute: '2-digit',
					timeZone: data.booking.start!.timeZone!
				})
			: ''
	);
	let endTime = $derived.by(() => {
		if (data.booking?.end?.dateTime) {
			return new Date(data.booking.end.dateTime).toLocaleTimeString('en', {
				hour12: false,
				hour: '2-digit',
				minute: '2-digit',
				timeZone: data.booking.end.timeZone!
			});
		}

		const bookingStartTime = data.booking?.start?.dateTime
			? new Date(data.booking.start.dateTime).toLocaleTimeString('en', {
					hour12: false,
					hour: '2-digit',
					minute: '2-digit',
					timeZone: data.booking.start!.timeZone!
				})
			: undefined;

		if (date && startTime !== bookingStartTime) {
			const startDate = new Date(date + ' ' + startTime);
			const endDate = new Date(startDate.getTime() + duration);

			return endDate.toLocaleTimeString('en', {
				hour12: false,
				hour: '2-digit',
				minute: '2-digit',
				timeZone: 'Europe/Lisbon'
			});
		}

		return '';
	});
	let description = $derived(data.booking?.description ?? '');
	let duration = $state(ms('30m'));

	let disabled = $state(true);

	async function book() {
		disabled = true;

		const startDate = new Date(
			new Date(`${date}T${startTime}:00`).toLocaleString('en-US', { timeZone: 'Europe/Lisbon' })
		).toISOString();
		const endDate = new Date(
			new Date(`${date}T${endTime}:00`).toLocaleString('en-US', { timeZone: 'Europe/Lisbon' })
		).toISOString();

		const busy = await checkAvailability({ startDate, endDate });

		if (busy.length > 0) {
			WebApp.showAlert('The Hive is already booked during ' + formatBusyTimes(busy));
		} else if (params.id) {
			await updateBooking({
				id: params.id,
				startDate,
				endDate,
				description: description.trim()
			});

			history.back();
		} else {
			const bookingId = await createBooking({
				startDate,
				endDate,
				description: description.trim()
			});

			WebApp.switchInlineQuery(bookingId);
		}
	}

	async function confirmDeleteBooking() {
		const confirmed = await new Promise((resolve) =>
			WebApp.showConfirm('Are you sure you want to delete this booking?', resolve)
		);

		if (confirmed) {
			await deleteBooking(params.id!);
			history.back();
		}
	}

	const bottomSheet: Attachment<HTMLDialogElement> = (dialog) => {
		dialog.showModal();

		return () => {
			dialog.close();
		};
	};

	$effect(() => {
		if (date !== params.date) {
			goto(resolve('/[date=date]/booking/[[id]]', { date, id: params.id }), {
				replaceState: true,
				keepFocus: true,
				noScroll: true
			});
		}
	});

	$effect(() => {
		if (date && startTime && endTime) {
			const startDate = new Date(date + ' ' + startTime);
			const endDate = new Date(date + ' ' + endTime);

			duration = endDate.getTime() - startDate.getTime();
		}
	});

	const checkValidity: Attachment<HTMLFormElement> = (form) => {
		async function check() {
			disabled = !form.checkValidity();
		}

		form.addEventListener('input', check);
		check();

		return () => {
			form.removeEventListener('input', check);
		};
	};

	function toSeconds(v: string) {
		const p = v.split(':').map(Number);
		return (p[0] || 0) * 3600 + (p[1] || 0) * 60 + (p[2] || 0);
	}

	function toTime(sec: number, parts: number) {
		const hh = String(Math.floor(sec / 3600)).padStart(2, '0');
		const mm = String(Math.floor((sec % 3600) / 60)).padStart(2, '0');
		const ss = String(sec % 60).padStart(2, '0');
		return parts === 2 ? `${hh}:${mm}` : `${hh}:${mm}:${ss}`;
	}

	function roundValue(v: string) {
		const parts = v.split(':').length;
		const total = toSeconds(v);

		const rounded = Math.round(total / step) * step;

		return toTime(rounded, parts);
	}

	function formatBusyTimes(times: TimePeriod[]): string {
		return times
			.map(
				(time) =>
					new Date(time.start!).toLocaleTimeString('en', {
						hour: '2-digit',
						minute: '2-digit',
						hour12: false,
						timeZone: 'Europe/Lisbon'
					}) +
					' - ' +
					new Date(time.end!).toLocaleTimeString('en', {
						hour: '2-digit',
						minute: '2-digit',
						hour12: false,
						timeZone: 'Europe/Lisbon'
					})
			)
			.join(', ');
	}
</script>

<dialog {@attach bottomSheet}>
	<form onsubmit={book} {@attach checkValidity}>
		<label>
			Date
			<input required type="date" bind:value={date} min={today} />
			<output>{new Date(date).toLocaleDateString('de', { dateStyle: 'short' })}</output>
		</label>
		<label>
			Start time
			<input
				required
				type="time"
				min={date === today ? nowTime : null}
				{step}
				bind:value={() => startTime, (time: string) => (startTime = roundValue(time))}
			/>
			<output class:placeholder={!startTime}>{startTime || 'Select time'}</output>
		</label>
		<label>
			End time
			<input
				required
				type="time"
				min={startTime}
				{step}
				bind:value={() => endTime, (time: string) => (endTime = roundValue(time))}
			/>
			<output class:placeholder={!endTime}>{endTime || 'Select time'}</output>
		</label>
		<label>
			For ...
			<input required bind:value={description} autocapitalize="off" placeholder="a reason" />
		</label>
		{#if params.id}
			<button type="button" class="delete" onclick={confirmDeleteBooking}> Delete </button>
		{/if}
		<button {disabled}>Book</button>
	</form>
</dialog>

<style>
	dialog {
		width: 100%;
		max-width: 100vw;
		margin: auto 0 0 0;
		border: 0;
		border-top-left-radius: 16px;
		border-top-right-radius: 16px;
		overscroll-behavior: contain;
	}

	dialog::backdrop {
		background: rgba(0, 0, 0, 20%);
	}

	form {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	label {
		display: flex;
		justify-content: space-between;
		align-items: center;
		height: 48px;
		padding: 4px;
	}

	label:not(:last-of-type) {
		padding-bottom: 4px;
		border-bottom: 1px solid #ccc;
	}

	input {
		border: 0;
		padding: 0;
		font-family: inherit;
		font-size: inherit;
		line-height: 40px;
		text-align: right;
		outline: 0;
		background: transparent;
	}

	input[type='date'],
	input[type='time'] {
		overflow: hidden;
		width: 0;
	}

	output.placeholder {
		color: #666;
	}

	button {
		display: flex;
		align-items: center;
		justify-content: center;
		height: 48px;
		padding: 0;
		border: 0;
		font-family: inherit;
		font-size: inherit;
		border-radius: 8px;
		background: seagreen;
		color: white;
	}

	button.delete {
		background: sienna;
	}

	button:disabled {
		background: gray;
	}
</style>
