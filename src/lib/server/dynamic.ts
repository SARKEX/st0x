import jwt from 'jsonwebtoken';
import { JwksClient } from 'jwks-rsa';
import { env } from '$env/dynamic/private';
import { env as publicEnv } from '$env/dynamic/public';

// Lazy initialization of JWKS client
let jwksClient: JwksClient | null = null;

function getJwksClient(): JwksClient {
	if (!jwksClient) {
		const environmentId = publicEnv.PUBLIC_DYNAMIC_ENVIRONMENT_ID;

		if (!environmentId) {
			throw new Error(
				'Dynamic environment ID not configured. Set PUBLIC_DYNAMIC_ENVIRONMENT_ID.'
			);
		}

		const jwksUri = `https://app.dynamic.xyz/api/v0/sdk/${environmentId}/.well-known/jwks`;

		jwksClient = new JwksClient({
			jwksUri,
			cache: true,
			cacheMaxAge: 600000, // 10 minutes
			rateLimit: true,
			jwksRequestsPerMinute: 10
		});
	}
	return jwksClient;
}

// Function to get signing key
async function getSigningKey(kid: string): Promise<string> {
	const client = getJwksClient();
	const key = await client.getSigningKey(kid);
	return key.getPublicKey();
}

export interface DynamicUser {
	id: string;
	email?: string;
	walletAddress?: string;
	walletPublicKey?: string;
	chain?: string;
	verifiedCredentials?: DynamicVerifiedCredential[];
}

export interface DynamicVerifiedCredential {
	id: string;
	address?: string;
	chain?: string;
	email?: string;
	format: string;
	walletName?: string;
	walletProvider?: string;
}

export interface DynamicSessionData {
	userId: string;
	walletAddress: string;
	email?: string;
	createdAt: number;
}

/**
 * Verify a Dynamic auth token and return user data
 */
export async function verifyDynamicToken(authToken: string): Promise<DynamicUser | null> {
	try {
		// Decode the token to get the header (to extract kid)
		const decoded = jwt.decode(authToken, { complete: true });

		if (!decoded || typeof decoded === 'string') {
			console.error('[dynamic] Invalid token format');
			return null;
		}

		const kid = decoded.header.kid;
		if (!kid) {
			console.error('[dynamic] Token missing kid in header');
			return null;
		}

		// Get the signing key
		const signingKey = await getSigningKey(kid);

		// Verify the token
		const payload = jwt.verify(authToken, signingKey, {
			algorithms: ['RS256']
		}) as jwt.JwtPayload;

		// Extract user info from the payload
		// Dynamic JWT payload structure
		const verifiedCredentials = payload.verified_credentials as DynamicVerifiedCredential[] | undefined;

		// Find the wallet credential
		const walletCredential = verifiedCredentials?.find(
			(cred) => cred.format === 'blockchain' && cred.address
		);

		// Find the email credential
		const emailCredential = verifiedCredentials?.find(
			(cred) => cred.format === 'email' && cred.email
		);

		return {
			id: payload.sub || '',
			email: emailCredential?.email || payload.email,
			walletAddress: walletCredential?.address,
			walletPublicKey: payload.wallet_public_key,
			chain: walletCredential?.chain,
			verifiedCredentials
		};
	} catch (error) {
		console.error('[dynamic] Token verification failed:', error);
		return null;
	}
}

/**
 * Extract embedded wallet address from Dynamic user
 */
export function getEmbeddedWalletAddress(user: DynamicUser): string | null {
	// First check the direct wallet field
	if (user.walletAddress) {
		return user.walletAddress;
	}

	// Then check verified credentials for wallet
	const walletCredential = user.verifiedCredentials?.find(
		(cred) => cred.format === 'blockchain' && cred.address
	);

	return walletCredential?.address ?? null;
}

/**
 * Extract email from Dynamic user
 */
export function getUserEmail(user: DynamicUser): string | null {
	if (user.email) {
		return user.email;
	}

	const emailCredential = user.verifiedCredentials?.find(
		(cred) => cred.format === 'email' && cred.email
	);

	return emailCredential?.email ?? null;
}

/**
 * Extract social login info from Dynamic user
 */
export function getSocialLoginInfo(
	user: DynamicUser
): { provider: string; name?: string } | null {
	// Look for OAuth credentials in verified credentials
	const socialCredential = user.verifiedCredentials?.find(
		(cred) => cred.format === 'oauth'
	);

	if (!socialCredential) return null;

	return {
		provider: socialCredential.walletProvider || 'social'
	};
}

/**
 * Create session data from Dynamic user
 */
export function createDynamicSessionData(user: DynamicUser): DynamicSessionData | null {
	const walletAddress = getEmbeddedWalletAddress(user);
	if (!walletAddress) {
		console.error('[dynamic] User has no wallet address');
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
 * Check if Dynamic is configured
 */
export function isDynamicConfigured(): boolean {
	return Boolean(publicEnv.PUBLIC_DYNAMIC_ENVIRONMENT_ID);
}
