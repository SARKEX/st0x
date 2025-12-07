import { PrivyClient } from '@privy-io/server-auth';
import { env } from '$env/dynamic/private';
import { env as publicEnv } from '$env/dynamic/public';

// Lazy initialization to avoid issues when env vars aren't available at build time
let privyClient: PrivyClient | null = null;

function getPrivyClient(): PrivyClient {
	if (!privyClient) {
		const appId = publicEnv.PUBLIC_PRIVY_APP_ID;
		const appSecret = env.PRIVY_APP_SECRET;

		if (!appId || !appSecret) {
			throw new Error('Privy credentials not configured. Set PUBLIC_PRIVY_APP_ID and PRIVY_APP_SECRET.');
		}

		privyClient = new PrivyClient(appId, appSecret);
	}
	return privyClient;
}

export interface PrivyUser {
	id: string;
	createdAt: number;
	linkedAccounts: PrivyLinkedAccount[];
	wallet?: {
		address: string;
		chainType: string;
	};
}

export interface PrivyLinkedAccount {
	type: string;
	address?: string;
	email?: string;
	name?: string;
	username?: string;
	verifiedAt?: number;
}

export interface PrivySessionData {
	userId: string;
	walletAddress: string;
	email?: string;
	createdAt: number;
}

/**
 * Verify a Privy auth token and return user data
 */
export async function verifyPrivyToken(authToken: string): Promise<PrivyUser | null> {
	try {
		const client = getPrivyClient();
		const verifiedClaims = await client.verifyAuthToken(authToken);

		// Get full user data
		const user = await client.getUser(verifiedClaims.userId);

		return {
			id: user.id,
			createdAt: user.createdAt.getTime(),
			linkedAccounts: user.linkedAccounts.map(account => ({
				type: account.type,
				address: 'address' in account ? (account.address ?? undefined) : undefined,
				email: 'email' in account ? (account.email ?? undefined) : undefined,
				name: 'name' in account ? (account.name ?? undefined) : undefined,
				username: 'username' in account ? (account.username ?? undefined) : undefined,
				verifiedAt: 'verifiedAt' in account && account.verifiedAt ? account.verifiedAt.getTime() : undefined
			})),
			wallet: user.wallet ? {
				address: user.wallet.address,
				chainType: user.wallet.chainType
			} : undefined
		};
	} catch (error) {
		console.error('[privy] Token verification failed:', error);
		return null;
	}
}

/**
 * Get user by their Privy user ID
 */
export async function getPrivyUser(userId: string): Promise<PrivyUser | null> {
	try {
		const client = getPrivyClient();
		const user = await client.getUser(userId);

		return {
			id: user.id,
			createdAt: user.createdAt.getTime(),
			linkedAccounts: user.linkedAccounts.map(account => ({
				type: account.type,
				address: 'address' in account ? (account.address ?? undefined) : undefined,
				email: 'email' in account ? (account.email ?? undefined) : undefined,
				name: 'name' in account ? (account.name ?? undefined) : undefined,
				username: 'username' in account ? (account.username ?? undefined) : undefined,
				verifiedAt: 'verifiedAt' in account && account.verifiedAt ? account.verifiedAt.getTime() : undefined
			})),
			wallet: user.wallet ? {
				address: user.wallet.address,
				chainType: user.wallet.chainType
			} : undefined
		};
	} catch (error) {
		console.error('[privy] Get user failed:', error);
		return null;
	}
}

/**
 * Extract embedded wallet address from Privy user
 */
export function getEmbeddedWalletAddress(user: PrivyUser): string | null {
	// First check the direct wallet field
	if (user.wallet?.address) {
		return user.wallet.address;
	}

	// Then check linked accounts for embedded wallet
	const embeddedWallet = user.linkedAccounts.find(
		account => account.type === 'wallet' && account.address
	);

	return embeddedWallet?.address ?? null;
}

/**
 * Extract email from Privy user
 */
export function getUserEmail(user: PrivyUser): string | null {
	const emailAccount = user.linkedAccounts.find(
		account => account.type === 'email' && account.email
	);
	return emailAccount?.email ?? null;
}

/**
 * Extract social login info from Privy user
 */
export function getSocialLoginInfo(user: PrivyUser): { provider: string; name?: string; username?: string } | null {
	const socialAccount = user.linkedAccounts.find(
		account => ['google_oauth', 'twitter_oauth', 'discord_oauth', 'github_oauth', 'apple_oauth'].includes(account.type)
	);

	if (!socialAccount) return null;

	return {
		provider: socialAccount.type.replace('_oauth', ''),
		name: socialAccount.name,
		username: socialAccount.username
	};
}

/**
 * Create session data from Privy user
 */
export function createPrivySessionData(user: PrivyUser): PrivySessionData | null {
	const walletAddress = getEmbeddedWalletAddress(user);
	if (!walletAddress) {
		console.error('[privy] User has no embedded wallet');
		return null;
	}

	return {
		userId: user.id,
		walletAddress,
		email: getUserEmail(user) ?? undefined,
		createdAt: Date.now()
	};
}

/**
 * Check if Privy is configured
 */
export function isPrivyConfigured(): boolean {
	return Boolean(publicEnv.PUBLIC_PRIVY_APP_ID && env.PRIVY_APP_SECRET);
}
