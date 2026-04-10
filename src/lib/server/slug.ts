/**
 * Lightweight slugifier — no dep needed for a 20-line helper.
 * Lowercases, strips diacritics, keeps [a-z0-9-], collapses runs of `-`.
 */
export function slugify(input: string): string {
	return input
		.normalize('NFKD')
		.replace(/[\u0300-\u036f]/g, '') // strip combining marks
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '')
		.slice(0, 80);
}
