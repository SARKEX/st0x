/**
 * Pinned public st0x.registry source commit.
 *
 * Production resolves the active commit via `/registry/manifest` → REST API.
 * Tests and E2E pin an immutable manifest until the REST API registry catches up.
 *
 * Bump when st0x.registry ships a new strategy/settings change, e.g.
 * ST0x-Technology/st0x.registry#41 (dia-limit DiaWords subparser).
 */
export const ST0X_REGISTRY_REPO = 'https://raw.githubusercontent.com/ST0x-Technology/st0x.registry';

/** st0x.registry commit with updated dia-limit DiaWords subparser (PR #41). */
export const ST0X_REGISTRY_SOURCE_COMMIT = 'a9d9e29aa44d0bba784f030d71128b247fd3c9a4';

export const ST0X_REGISTRY_MANIFEST_URL = `${ST0X_REGISTRY_REPO}/${ST0X_REGISTRY_SOURCE_COMMIT}/registry`;
