<script lang="ts">
	import { onMount } from 'svelte';

	// Calm v2 ambient: three drifting aurora blooms + a sparse field of soft
	// floating "bokeh" orbs on a canvas. Reads the theme tokens so it retints on
	// light/dark switch. Respects reduced-motion.

	let canvas: HTMLCanvasElement;

	type Rgb = [number, number, number];

	function parseRgb(value: string, fallback: Rgb): Rgb {
		const v = value.trim();
		const hex = v.match(/^#([0-9a-f]{6})$/i);
		if (hex) {
			const n = parseInt(hex[1], 16);
			return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
		}
		const rgb = v.match(/(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
		if (rgb) return [+rgb[1], +rgb[2], +rgb[3]];
		return fallback;
	}

	function themeColors(): { mint: Rgb; iris: Rgb } {
		const cs = getComputedStyle(document.documentElement);
		return {
			mint: parseRgb(cs.getPropertyValue('--accent'), [45, 227, 166]),
			iris: parseRgb(cs.getPropertyValue('--iris'), [125, 139, 255])
		};
	}

	onMount(() => {
		const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
		const ctx = canvas.getContext('2d');
		if (!ctx) return;

		let palette = themeColors();
		let width = 0;
		let height = 0;
		const dpr = Math.min(window.devicePixelRatio || 1, 2);

		function resize() {
			width = window.innerWidth;
			height = window.innerHeight;
			canvas.width = width * dpr;
			canvas.height = height * dpr;
			canvas.style.width = width + 'px';
			canvas.style.height = height + 'px';
			ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
		}
		resize();
		window.addEventListener('resize', resize);

		const rnd = (a: number, b: number) => a + Math.random() * (b - a);
		const count = Math.max(14, Math.min(26, Math.round((width * height) / 90000)));
		const orbs = Array.from({ length: count }, () => {
			const r = rnd(26, 120);
			return {
				x: rnd(0, width),
				y: rnd(0, height),
				r,
				vy: (-rnd(2, 7) / 1000) * (140 / r),
				vx: (rnd(-1, 1) / 1000) * (60 / r),
				mint: Math.random() < 0.62,
				baseA: rnd(0.05, 0.14) * (60 / r + 0.5),
				tw: rnd(0.0004, 0.0011),
				ph: rnd(0, Math.PI * 2)
			};
		});

		function paint(t: number) {
			ctx!.clearRect(0, 0, width, height);
			ctx!.globalCompositeOperation = 'lighter';
			for (const o of orbs) {
				const a = Math.max(0.02, o.baseA * (0.6 + 0.4 * Math.sin(t * o.tw + o.ph)));
				const [r, g, b] = o.mint ? palette.mint : palette.iris;
				const grad = ctx!.createRadialGradient(o.x, o.y, 0, o.x, o.y, o.r);
				grad.addColorStop(0, `rgba(${r},${g},${b},${a})`);
				grad.addColorStop(1, `rgba(${r},${g},${b},0)`);
				ctx!.fillStyle = grad;
				ctx!.beginPath();
				ctx!.arc(o.x, o.y, o.r, 0, Math.PI * 2);
				ctx!.fill();
			}
			ctx!.globalCompositeOperation = 'source-over';
		}

		function step(dt: number) {
			for (const o of orbs) {
				o.x += o.vx * dt;
				o.y += o.vy * dt;
				const m = o.r;
				if (o.y < -m) {
					o.y = height + m;
					o.x = rnd(0, width);
				}
				if (o.x < -m) o.x = width + m;
				if (o.x > width + m) o.x = -m;
			}
		}

		const retint = () => {
			palette = themeColors();
		};
		window.addEventListener('st0x-retint', retint);

		if (reduce) {
			paint(0);
			return () => {
				window.removeEventListener('resize', resize);
				window.removeEventListener('st0x-retint', retint);
			};
		}

		let last = performance.now();
		let raf = 0;
		function loop(now: number) {
			const dt = Math.min(50, now - last);
			last = now;
			step(dt);
			paint(now);
			raf = requestAnimationFrame(loop);
		}
		raf = requestAnimationFrame(loop);

		const onVisibility = () => {
			if (document.hidden) {
				cancelAnimationFrame(raf);
			} else {
				last = performance.now();
				raf = requestAnimationFrame(loop);
			}
		};
		document.addEventListener('visibilitychange', onVisibility);

		return () => {
			cancelAnimationFrame(raf);
			window.removeEventListener('resize', resize);
			window.removeEventListener('st0x-retint', retint);
			document.removeEventListener('visibilitychange', onVisibility);
		};
	});
</script>

<div class="pointer-events-none fixed inset-0 z-0 overflow-hidden" aria-hidden="true">
	<canvas bind:this={canvas} class="absolute inset-0"></canvas>
	<div
		class="absolute h-[560px] w-[620px] rounded-full opacity-[0.85] blur-[80px]"
		style="left:6%;top:-14%;background:radial-gradient(circle at 50% 50%, var(--aura-a), transparent 70%);animation:auraDrift1 54s ease-in-out infinite;"
	></div>
	<div
		class="absolute h-[520px] w-[540px] rounded-full opacity-[0.85] blur-[80px]"
		style="left:64%;top:2%;background:radial-gradient(circle at 50% 50%, var(--aura-b), transparent 70%);animation:auraDrift2 66s ease-in-out infinite;"
	></div>
	<div
		class="absolute h-[660px] w-[720px] rounded-full opacity-[0.85] blur-[80px]"
		style="left:28%;top:42%;background:radial-gradient(circle at 50% 50%, var(--aura-c), transparent 70%);animation:auraDrift3 78s ease-in-out infinite;"
	></div>
</div>
