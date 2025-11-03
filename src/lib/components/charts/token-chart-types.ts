export type TradeHistoryPoint = {
	timestamp: number;
	price: number;
	tokens: number;
	usdc: number;
	side: 'buy' | 'sell';
};

export type VolumeBucket = {
	start: number;
	tokens: number;
};

export type DepthPoint = {
	price: number;
	quantity: number;
};

export type DepthSeries = {
	bids: DepthPoint[];
	asks: DepthPoint[];
};
