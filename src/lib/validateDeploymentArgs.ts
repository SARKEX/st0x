export type ValidateFunction = (value: string | undefined) => string | undefined;

export const validateSelectedAmount: ValidateFunction = (selectedAmount) => {
	if (selectedAmount === undefined || selectedAmount === '') {
		return 'Amount is required';
	}
	if (Number(selectedAmount) <= 0) {
		return 'Amount must be greater than 0';
	}
	return undefined;
};

export const validatePeriod: ValidateFunction = (period) => {
	if (period === undefined || period === '') {
		return 'Period is required';
	}
	if (Number(period) <= 0) {
		return 'Period must be greater than 0';
	}
	return undefined;
};

export const validateBaseline: ValidateFunction = (baseline) => {
	if (baseline === undefined || baseline === '') {
		return 'Baseline is required';
	}
	return undefined;
};

export const validateOverrideDepositAmount: ValidateFunction = (overrideDepositAmount) => {
	if (overrideDepositAmount === undefined || overrideDepositAmount === '') {
		return 'Override deposit amount is required';
	}
	return undefined;
};
