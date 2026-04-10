<script lang="ts">
	import favicon from '$lib/assets/favicon.svg';

	let { children } = $props();
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

{@render children()}

<style>
	:global(body) {
		font-family: system-ui;
		background: #efefef;
		color: #333;
		box-sizing: border-box;
	}

	:global(*, *::before, *::after) {
		box-sizing: inherit;
	}
</style>
