/**
 * Resolves static asset paths safely across different hosting environments
 * (e.g. GitHub Pages with /UI_alfa/ subpath, Vercel root /, or local dev).
 *
 * @param path Relative or leading-slash path to static file in /public (e.g. '/images/LOGO.png')
 * @returns Correctly prefixed path
 */
export function assetUrl(path: string): string {
  const clean = path.replace(/^\//, '');
  const base = import.meta.env.BASE_URL || './';
  return base.endsWith('/') ? `${base}${clean}` : `${base}/${clean}`;
}
