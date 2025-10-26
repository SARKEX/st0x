export type ValidateFunction = (value: string | undefined) => string | undefined;

const createValidator = (fieldName: string, mustBePositive = false): ValidateFunction => {
	return (value: string | undefined) => {
		if (value === undefined || value === '') {
			return `${fieldName} is required`;
		}
		if (mustBePositive && Number(value) <= 0) {
			return `${fieldName} must be greater than 0`;
		}
		return undefined;
	};
};

export const validateSelectedAmount = createValidator('Amount', true);
export const validatePeriod = createValidator('Period', true);
export const validateBaseline = createValidator('Baseline', false);
export const validateOverrideDepositAmount = createValidator('Override deposit amount', false);
