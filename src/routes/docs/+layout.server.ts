import { getCategories, getFiles, processDocs } from '$lib/docs/processDocs';

export const load = async () => {
	return { categorisedArticles: await processDocs(getFiles(), getCategories()) };
};
