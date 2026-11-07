/**
 * Single source of truth for AZCCTV artwork stored under src/assets.
 * Assets are bundled by Vite, so URLs remain correct behind a reverse proxy.
 */
const assets = import.meta.glob<string>("/src/assets/**/*.{svg,png,webp,jpg,jpeg}", {
  eager: true,
  query: "?url",
  import: "default",
});

function logoPriority(path: string) {
  const name = path.toLowerCase();
  const filename = name.split("/").at(-1) ?? "";
  const identified = /az[-_ ]?cctv|azcctv/.test(name);
  if (identified && /(?:app[-_ ]?icon|brand[-_ ]?icon|logo[-_ ]?icon)/.test(filename)) return 0;
  if (identified && /(?:logo|icon|symbol)/.test(filename)) return 1;
  if (identified) return 2;
  if (/^(?:logo|brand|app[-_]?icon)(?:[-_.]|$)/.test(filename)) return 3;
  if (/logo|symbol|brand/.test(filename)) return 4;
  return 10;
}

const ranked = Object.entries(assets)
  .filter(([path]) => logoPriority(path) < 10)
  .sort(([a], [b]) => logoPriority(a) - logoPriority(b) || a.localeCompare(b));

export const brandLogoUrl: string | null = ranked[0]?.[1] ?? null;
export const brandName = "AZCCTV";
export const brandColors = { navy: "#030957", gold: "#FFB900" } as const;
