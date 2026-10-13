/**
 * Resolve the existing AZCCTV artwork from src/assets at build time.
 * Keep logo paths centralized for both React components and document icons.
 */
const assets = import.meta.glob<string>("/src/assets/**/*.{svg,png,webp,jpg,jpeg}", {
  eager: true,
  query: "?url",
  import: "default",
});

function rank(path: string) {
  const name = path.toLowerCase();
  if (/az.?cctv/.test(name) && /symbol|icon/.test(name)) return 0;
  if (/symbol|logo.?icon|brand.?icon/.test(name)) return 1;
  if (/az.?cctv|logo|brand|primary/.test(name)) return 2;
  if (/\/1\.svg$/.test(name)) return 3;
  return 10;
}

export const brandLogoUrl = Object.entries(assets)
  .filter(([path]) => rank(path) < 10)
  .sort(([left], [right]) => rank(left) - rank(right))[0]?.[1] ?? null;
