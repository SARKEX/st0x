export type TradeHistoryPoint = {
	timestamp: number;
	price: number;
	tokens: number;
	quote: number;
	side: 'bid' | 'ask';
};

export type VolumeBucket = {
	start: number;
	tokens: number;
};

export type OHLCBucket = {
	x: number; // timestamp (start of bucket)
	o: number; // open
	h: number; // high
	l: number; // low
	c: number; // close
};

export type DepthPoint = {
	price: number;
	quantity: number;
};

export type DepthSeries = {
	bids: DepthPoint[];
	asks: DepthPoint[];
};
