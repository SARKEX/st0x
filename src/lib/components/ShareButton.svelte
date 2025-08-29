<script lang="ts">
	import { page } from '$app/stores';
	import { ShareNodesSolid, EnvelopeSolid, LinkOutline } from 'flowbite-svelte-icons';
	import { onMount } from 'svelte';
	
	let showShareModal = false;
	let shareUrl = '';
	let shareTitle = 'Check out ST0x';
	let shareText = 'Trade tokenized equities, set up automated on-chain trading strategies, and more';
	let copied = false;
	let canNativeShare = false;
	
	// Check if native share is available
	onMount(() => {
		if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
			canNativeShare = true;
		}
	});
	
	$: shareUrl = typeof window !== 'undefined' ? window.location.href : '';
	$: shareTitle = $page.data?.title || 'ST0x - Tokenized equities';
	
	async function handleShare() {
		// Try native share first if available
		if (canNativeShare) {
			try {
				await navigator.share({
					title: shareTitle,
					text: shareText,
					url: shareUrl
				});
				// Native share successful, don't show modal
				return;
			} catch (err) {
				// Check if user just cancelled (AbortError) or clicked outside (NotAllowedError)
				const errorName = (err as Error).name;
				if (errorName === 'AbortError' || errorName === 'NotAllowedError') {
					// User cancelled or dismissed - don't show fallback modal
					return;
				}
				// Real error occurred, fall through to show modal
				console.log('Share failed with error:', err);
			}
		}
		
		// Show custom share modal only if native share is not available or had a real error
		showShareModal = true;
	}
	
	function shareVia(platform: string) {
		let url = '';
		const encodedUrl = encodeURIComponent(shareUrl);
		const encodedText = encodeURIComponent(shareText);
		const encodedTitle = encodeURIComponent(shareTitle);
		
		switch(platform) {
			case 'telegram':
				// Telegram: URL must be separate for proper link preview
				const telegramText = `${shareTitle}\n\n${shareText}`;
				url = `https://t.me/share/url?url=${encodedUrl}&text=${encodeURIComponent(telegramText)}`;
				break;
			case 'whatsapp':
				// WhatsApp: Combine text and URL with line breaks for better formatting
				const whatsappText = `${shareTitle}\n\n${shareText}\n\n${shareUrl}`;
				url = `https://wa.me/?text=${encodeURIComponent(whatsappText)}`;
				break;
			case 'twitter':
				// Twitter/X: Keep text and URL separate for proper link card
				url = `https://twitter.com/intent/tweet?text=${encodedText}&url=${encodedUrl}`;
				break;
			case 'linkedin':
				// LinkedIn: URL parameter handles link preview automatically
				url = `https://www.linkedin.com/sharing/share-offsite/?url=${encodedUrl}`;
				break;
			case 'email':
				// Email: Format with proper line breaks for readability
				const emailBody = `${shareText}\n\n${shareUrl}`;
				url = `mailto:?subject=${encodedTitle}&body=${encodeURIComponent(emailBody)}`;
				break;
		}
		
		if (url) {
			window.open(url, '_blank');
			showShareModal = false;
		}
	}
	
	async function copyLink() {
		try {
			await navigator.clipboard.writeText(shareUrl);
			copied = true;
			setTimeout(() => {
				copied = false;
			}, 2000);
		} catch (err) {
			console.error('Failed to copy:', err);
		}
	}
	
	function closeModal(e: MouseEvent) {
		if (e.target === e.currentTarget) {
			showShareModal = false;
		}
	}
</script>

<!-- Share Button -->
<button
	on:click={handleShare}
	class="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-base font-normal text-gray-300 transition-colors hover:bg-white/5 hover:text-white"
>
	<ShareNodesSolid class="h-5 w-5" />
	<span>Share</span>
</button>

<!-- Share Modal -->
{#if showShareModal}
	<div 
		class="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm"
		on:click={closeModal}
		role="button"
		tabindex="0"
		on:keydown={(e) => e.key === 'Escape' && (showShareModal = false)}
	>
		<div class="mx-4 w-full max-w-sm rounded-xl border border-white/10 bg-gray-800/95 p-6 backdrop-blur-lg">
			<div class="mb-4 flex items-center justify-between">
				<h3 class="text-lg font-semibold">Share this page</h3>
				<button
					on:click={() => (showShareModal = false)}
					class="rounded-lg p-1 transition-colors hover:bg-white/10"
				>
					<svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
					</svg>
				</button>
			</div>
			
			<!-- Share Options Grid -->
			<div class="grid grid-cols-3 gap-3">
				<button
					on:click={() => shareVia('telegram')}
					class="flex flex-col items-center gap-2 rounded-lg border border-white/10 bg-white/5 p-3 transition-all hover:border-yellow-500/30 hover:bg-white/10"
				>
					<svg class="h-8 w-8" viewBox="0 0 24 24" fill="currentColor">
						<path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.56c-.21 2.27-1.13 7.75-1.6 10.29-.2 1.08-.59 1.44-.97 1.47-.82.07-1.45-.54-2.24-.05-1.24-.62-1.95-1.01-3.15-1.61-1.39-.7-.49-1.08.3-1.71.21-.16 3.82-3.5 3.89-3.8.01-.04.01-.19-.07-.27-.09-.08-.22-.05-.32-.03-.14.03-2.3 1.46-6.48 4.29-.61.42-1.17.63-1.67.62-.55-.01-1.6-.31-2.39-.56-.96-.31-1.72-.47-1.66-.99.04-.27.42-.55 1.16-.82 4.54-1.98 7.57-3.29 9.1-3.93 4.33-1.82 5.23-2.14 5.82-2.15.13 0 .41.03.6.18.16.13.2.31.22.46-.01.06.01.24 0 .38z"/>
					</svg>
					<span class="text-xs">Telegram</span>
				</button>
				
				<button
					on:click={() => shareVia('whatsapp')}
					class="flex flex-col items-center gap-2 rounded-lg border border-white/10 bg-white/5 p-3 transition-all hover:border-yellow-500/30 hover:bg-white/10"
				>
					<svg class="h-8 w-8" viewBox="0 0 24 24" fill="currentColor">
						<path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.149-.67.149-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414-.074-.123-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/>
					</svg>
					<span class="text-xs">WhatsApp</span>
				</button>
				
				<button
					on:click={() => shareVia('twitter')}
					class="flex flex-col items-center gap-2 rounded-lg border border-white/10 bg-white/5 p-3 transition-all hover:border-yellow-500/30 hover:bg-white/10"
				>
					<svg class="h-8 w-8" viewBox="0 0 24 24" fill="currentColor">
						<path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
					</svg>
					<span class="text-xs">X/Twitter</span>
				</button>
				
				<button
					on:click={() => shareVia('linkedin')}
					class="flex flex-col items-center gap-2 rounded-lg border border-white/10 bg-white/5 p-3 transition-all hover:border-yellow-500/30 hover:bg-white/10"
				>
					<svg class="h-8 w-8" viewBox="0 0 24 24" fill="currentColor">
						<path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
					</svg>
					<span class="text-xs">LinkedIn</span>
				</button>
				
				<button
					on:click={() => shareVia('email')}
					class="flex flex-col items-center gap-2 rounded-lg border border-white/10 bg-white/5 p-3 transition-all hover:border-yellow-500/30 hover:bg-white/10"
				>
					<EnvelopeSolid class="h-8 w-8" />
					<span class="text-xs">Email</span>
				</button>
				
				<button
					on:click={copyLink}
					class="flex flex-col items-center gap-2 rounded-lg border border-white/10 bg-white/5 p-3 transition-all hover:border-yellow-500/30 hover:bg-white/10"
				>
					<LinkOutline class="h-8 w-8" />
					<span class="text-xs">{copied ? 'Copied!' : 'Copy Link'}</span>
				</button>
			</div>
			
			<!-- Current URL Display -->
			<div class="mt-4 rounded-lg border border-white/10 bg-white/5 p-3">
				<p class="mb-1 text-xs text-gray-400">Sharing:</p>
				<p class="truncate text-sm font-mono text-gray-300">{shareUrl}</p>
			</div>
		</div>
	</div>
{/if}