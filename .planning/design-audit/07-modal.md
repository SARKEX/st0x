# Design Audit — Save & Earn deposit/withdraw modal

**Our file:** `src/lib/components/earn/SaveEarnModal.svelte` (plus `earn/EarnIcon.svelte`, `earn/TokenDisc.svelte`, `earn/ApyChip.svelte`)
**Mock source:** `src2/DepositModal.jsx` + `src2/atoms.jsx`
**Mock targets:** `screenshots/modal-final.png` (deposit/step0), `modal-review.png` + `02-modal-success.png` is actually step1 layout, `03-modal-success.png` (success/step2), `modal.png`/`modal2.png`/`01-modal-success.png`/`02-modal-success.png` are *older* iterations, `modal-v2.png` shows a dropped "CHOOSE YOUR YIELD" segment.

## Overall verdict

This is a **high-fidelity port** — structure, steps, icons (via `EarnIcon`), `TokenDisc`, `ApyChip`, progress dots, and copy all match the mock 1:1. The discrepancies are almost entirely **surface-color token drift**: our code swapped the mock's translucent overlays (`bg-black/30`, `bg-white/[0.06]`, `bg-white/[0.03]`, `border-white/10`) for opaque var tokens (`bg-surface-2`, `border-line`). Because the mock layers translucent fills over a near-black `#0a0f17` modal body, the opaque substitutes read lighter/flatter and lose the layered depth. The brief says structural color should prefer var tokens, **but** here the mock deliberately uses `black/30` + `emerald/[0.05]` translucency for the field stack and our `bg-surface-2` (`#111a25`, opaque) is visibly the wrong value. Fixes below restore the mock's exact classes.

Note on screenshot drift: the live JSX (`DepositModal.jsx`, the source of truth) and `modal-final.png` are what we match against. Older PNGs (`modal.png`, `modal2.png`, `modal-v2.png`) show abandoned variants (e.g. the segmented "Compound / Get paid" yield toggle in `modal-v2.png`) — do **not** build those; the final JSX dropped them and so should we. Our omission of that toggle is **correct**.

---

## P0 — structural / clearly visible

- [ ] **Modal body background is the wrong color.**
  - *Now:* shell uses `bg-gray-950` (line 256).
  - *Mock:* `bg-[#0a0f17]` (`DepositModal.jsx:21`). `gray-950` is `#030712` (Tailwind) — noticeably darker/bluer than the mock's `#0a0f17`. Neither is a project var token.
  - *Fix:* change `bg-gray-950` → `bg-[#0a0f17]` on the dialog `<div>`.

- [ ] **Amount field (step 0 "You save") uses the wrong fill + border.**
  - *Now:* `rounded-xl border border-line bg-surface-2 px-4 py-3` (line 295).
  - *Mock:* `rounded-xl border border-white/10 bg-black/30 px-4 py-3` (`DepositModal.jsx:33`). `bg-surface-2` is opaque `#111a25`; the mock wants translucent `bg-black/30` so the modal's emerald glow shows through, and `border-white/10` (≈0.10) is stronger than `border-line` (0.07).
  - *Fix:* `bg-surface-2` → `bg-black/30`; `border-line` → `border-white/10`.

- [ ] **USDC chip inside the amount field uses the wrong fill.**
  - *Now:* `rounded-lg bg-surface-2 px-2 py-1` (line 327; also the deposit-mode "You receive" USDC chip in withdraw mode, line 372).
  - *Mock:* `rounded-lg bg-white/[0.06] px-2 py-1` (`DepositModal.jsx:40`). On an already-`surface-2` parent in our version both layers collapse to the same color and the chip disappears; the mock's translucent `white/[0.06]` keeps it distinct.
  - *Fix:* both USDC chips → `bg-white/[0.06]`.

- [ ] **Arrow connector icon differs from final mock.**
  - *Now:* `<EarnIcon name="arrowDown" ... />` inside the circle (line 352).
  - *Mock:* `<Icon name="arrowRight" className="h-4 w-4 rotate-90" />` (`DepositModal.jsx:44`) — a right-arrow rotated 90°. `arrowDown` in our icon set is the download-style glyph (`M12 5v14M6 13l6 6 6-6`), while `arrowRight rotate-90` is the chevron-tipped line arrow (`M5 12h14M13 6l6 6-6 6`). They render differently (download triangle vs line+arrowhead). `modal-final.png` shows the thin line-arrow.
  - *Fix:* use `name="arrowRight" className="h-4 w-4 rotate-90"` to match. (Low risk; both exist in `EarnIcon`.)

- [ ] **Arrow-circle background uses the wrong fill.**
  - *Now:* `border border-line bg-surface-2` (line 350).
  - *Mock:* `border border-white/10 bg-black/30` (`DepositModal.jsx:44`).
  - *Fix:* `bg-surface-2` → `bg-black/30`; `border-line` → `border-white/10`.

- [ ] **"Projected growth" row uses the wrong fill.**
  - *Now:* `rounded-lg bg-surface-2 px-4 py-3` (line 386).
  - *Mock:* `rounded-lg bg-white/[0.03] px-4 py-3` (`DepositModal.jsx:50`) — a very faint white wash, not the opaque `surface-2`. In `modal-final.png` this row is barely lighter than the body; our opaque version is a solid panel.
  - *Fix:* `bg-surface-2` → `bg-white/[0.03]`.

- [ ] **Review summary card (step 1) uses the wrong fill + border.**
  - *Now:* `rounded-xl border border-line bg-surface-2 p-4` (line 412).
  - *Mock:* `rounded-xl border border-white/10 bg-black/30 p-4` (`DepositModal.jsx:61`).
  - *Fix:* `bg-surface-2` → `bg-black/30`; `border-line` → `border-white/10`.

- [ ] **Review "Est. earnings" divider row missing the top border.**
  - *Now:* every row uses the same `flex items-center justify-between gap-3` with no per-row border (lines 413–421). There is no `border-t` separating the "Est. earnings" block.
  - *Mock:* the 5th row (index 4, "Est. earnings") gets `border-t border-white/10 pt-2.5` (`DepositModal.jsx:70` — `${i === 4 ? 'border-t border-white/10 pt-2.5' : ''}`). See `02-modal-success.png`/`modal-review.png`: there is a clear hairline above "Est. earnings".
  - *Fix:* in the `{#each}`, add the divider classes when the row key is `'Est. earnings'` (use the key, not a hardcoded index, since deposit vs withdraw rows differ): `class:border-t / class:border-white/10 / class:pt-2.5` keyed on `row[0] === 'Est. earnings'`.

- [ ] **Info/disclaimer box (step 1) uses the wrong border + fill.**
  - *Now:* `border border-line bg-surface-2 px-3 py-2.5` (line 425).
  - *Mock:* `border border-white/[0.07] bg-white/[0.02] px-3 py-2.5` (`DepositModal.jsx:74`). The mock disclaimer is an almost-invisible translucent strip; our `bg-surface-2` makes it a solid card competing with the summary above it (see `02-modal-success.png` where it's a faint outline).
  - *Fix:* `border-line` → `border-white/[0.07]`; `bg-surface-2` → `bg-white/[0.02]`.

- [ ] **Success "Earning +$…/yr" pill uses the wrong fill.**
  - *Now:* `rounded-lg bg-surface-2 px-4 py-2` (line 478).
  - *Mock:* `rounded-lg bg-white/[0.04] px-4 py-2` (`DepositModal.jsx:90`). In `03-modal-success.png` this is a soft translucent chip on the dark body, not an opaque panel.
  - *Fix:* `bg-surface-2` → `bg-white/[0.04]`.

---

## P1 — color / token fidelity

- [ ] **Header subtitle + "You save" label color slightly off.**
  - *Now:* subtitle `text-[11px] text-text-2` (line 277); field label `text-xs text-text-2` (line 296).
  - *Mock:* subtitle is `text-gray-400` (`DepositModal.jsx:25`) and the field label header is also `text-gray-400` (`:34`). Our `--text-2` is `#9aa9bb`; Tailwind `gray-400` is `#9ca3af`. Very close, acceptable — but note the mock's field-label header uses `text-gray-400` while inner secondary text varies. Low priority; flag only if pixel-matching gray hues.
  - *Fix (optional):* leave as `text-text-2` — within tolerance per brief. No change needed unless strict.

- [ ] **"Back" button border token slightly stronger than mock.**
  - *Now:* `border border-line-strong` (line 438) → `--line-strong` rgba(255,255,255,0.12).
  - *Mock:* `border border-white/15` (`DepositModal.jsx:79`) ≈ 0.15. Our `line-strong` is 0.12, a hair lighter.
  - *Fix:* `border-line-strong` → `border-white/15` for an exact match (minor).

- [ ] **"Back" button hover uses the wrong surface.**
  - *Now:* `hover:bg-surface-2` (line 438).
  - *Mock:* `hover:bg-white/5` (`DepositModal.jsx:79`).
  - *Fix:* `hover:bg-surface-2` → `hover:bg-white/5`. Same applies to the **close button hover** (line 285 `hover:bg-surface-2` → mock `hover:bg-white/5`, `DepositModal.jsx:26`).

- [ ] **Header divider border.**
  - *Now:* `border-b border-line` (line 269).
  - *Mock:* `border-b border-white/[0.06]` (`DepositModal.jsx:24`). `--line` is 0.07 vs mock 0.06 — within tolerance, optional. The brief maps `border-white/[0.06]`→`border-line`, so **keep `border-line`** here (this one is the sanctioned mapping; the `border-white/10` cases above are NOT — they're a stronger, deliberate value).

- [ ] **Progress dots inactive color: keep literal.**
  - *Now:* `bg-white/15` for inactive, `bg-emerald-400` active (lines 501–502).
  - *Mock:* identical (`DepositModal.jsx:98`). No change — correct.

---

## P2 — polish / notes (no action or low priority)

- [ ] **Withdraw mode has no mock counterpart.** The withdraw flow (`mode === 'withdraw'`: lines 306–314, 330–344, 368–375, the 4-row review at 413, the withdraw success copy at 467–474) is a **real feature the static mock lacks**. Per brief, do **not** delete it. It already mirrors the deposit visual language (same field/chip/review styling). Just apply the same surface-token fixes from P0 to its branches: the withdraw input field shares the same outer card (already covered), and the "You receive" USDC chip at line 372 is covered by the USDC-chip fix above. No withdraw-specific mock to diverge from — current treatment is reasonable.

- [ ] **Withdraw "You receive" card keeps the emerald-tinted container (line 356) even in withdraw mode.** In withdraw mode you receive USDC (blue), but the receive card border/bg is `border-emerald-400/20 bg-emerald-400/[0.05]` regardless. This is a minor semantic oddity (emerald frame around a USDC payout) with no mock reference. Optional: gate the emerald tint to `isDeposit` and use a neutral `bg-black/30 border-white/10` for the withdraw receive card. Low priority, judgment call — leave unless design wants it.

- [ ] **Success check icon + circle match mock exactly** (`h-16 w-16 rounded-full bg-emerald-400/15 text-emerald-300`, `check` icon `h-8 w-8 stroke=2.2`) — lines 461–465 vs `DepositModal.jsx:87`. No change. `03-modal-success.png` confirms.

- [ ] **Backdrop, emerald glow blob, max-width, radius, border all correct.** `bg-black/70 backdrop-blur-sm` (line 251), `-right-16 -top-16 h-48 w-48 rounded-full bg-emerald-400/15 blur-3xl` (line 265), `max-w-md rounded-2xl border border-emerald-400/25` (line 256) all match `DepositModal.jsx:20–22`. No change. (Only the body fill `bg-gray-950` is wrong — see P0.)

- [ ] **Buttons (primary `bg-emerald-500 text-[#05241a] hover:bg-emerald-400`, `py-3 text-sm font-semibold`) match the mock exactly** across all three steps. No change.

- [ ] **`z-[2200]` vs mock `z-[120]`** — ours is higher to clear the live app's other stacking contexts. Keep ours (real-app concern, not a visual diff).

---

## Summary of concrete edits

All within `SaveEarnModal.svelte`:
1. L256 `bg-gray-950` → `bg-[#0a0f17]`
2. L295 `bg-surface-2` → `bg-black/30`, `border-line` → `border-white/10`
3. L327 & L372 USDC chips `bg-surface-2` → `bg-white/[0.06]`
4. L350 `bg-surface-2` → `bg-black/30`, `border-line` → `border-white/10`; L352 `name="arrowDown"` → `name="arrowRight" className="h-4 w-4 rotate-90"`
5. L386 `bg-surface-2` → `bg-white/[0.03]`
6. L412 `bg-surface-2` → `bg-black/30`, `border-line` → `border-white/10`
7. L413–421 add `border-t border-white/10 pt-2.5` to the `Est. earnings` row
8. L425 `border-line` → `border-white/[0.07]`, `bg-surface-2` → `bg-white/[0.02]`
9. L438 `border-line-strong` → `border-white/15`, `hover:bg-surface-2` → `hover:bg-white/5`; L285 `hover:bg-surface-2` → `hover:bg-white/5`
10. L478 `bg-surface-2` → `bg-white/[0.04]`

**Keep all execution logic, bindings, stores, queries, and the withdraw-mode branches untouched** — these are presentational class swaps only.
