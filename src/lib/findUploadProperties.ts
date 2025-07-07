export interface SchemaProperty {
	type: string;
	title?: string;
	editor?: string;
	properties?: { [key: string]: SchemaProperty };
}

export async function findUploadProperties(
	obj: { [key: string]: SchemaProperty },
	currentPath: string[] = []
): Promise<string[]> {
	let result: string[] = [];

	if (!obj || typeof obj !== 'object') {
		return result;
	}

	for (const key in obj) {
		if (Object.prototype.hasOwnProperty.call(obj, key)) {
			const value: string | SchemaProperty = obj[key];
			const newPath: string = currentPath.concat(key).join('.');

			if (value && typeof value === 'object') {
				if (value.editor && value.editor === 'upload') {
					result.push(newPath);
				}

				if (value.properties) {
					const res = await findUploadProperties(value.properties, currentPath.concat(key));
					result = result.concat(res);
				}
			}
		}
	}

	return result;
}
