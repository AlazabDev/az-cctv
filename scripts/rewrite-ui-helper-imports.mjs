import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const moved = {
  badge: { badgeVariants: "badge-variants" },
  button: { buttonVariants: "button-variants" },
  toggle: { toggleVariants: "toggle-variants" },
  "navigation-menu": { navigationMenuTriggerStyle: "navigation-menu-variants" },
  sidebar: { useSidebar: "sidebar-context", sidebarMenuButtonVariants: "sidebar-variants" },
  form: { useFormField: "form-context" },
};
function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  const result = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === ".git") continue;
    const target = path.join(dir, entry.name);
    if (entry.isDirectory()) result.push(...walk(target));
    else if (/\.(tsx?|jsx?)$/.test(target)) result.push(target);
  }
  return result;
}
let changed = 0;
for (const file of [...walk(path.join(root, "src")), ...walk(path.join(root, "tests"))]) {
  const original = fs.readFileSync(file, "utf8");
  const updated = original.replace(/import\s*\{([\s\S]*?)\}\s*from\s*(["'])([^"']+)\2;?/g, (full, bindings, quote, source) => {
    const globalMatch = source.match(/^(.*\/ui\/)(badge|button|toggle|navigation-menu|sidebar|form)$/);
    const localMatch = file.includes(path.join("components", "ui") + path.sep)
      ? source.match(/^(\.\/)(badge|button|toggle|navigation-menu|sidebar|form)$/)
      : null;
    const matched = globalMatch ?? localMatch;
    if (!matched) return full;
    const prefix = matched[1], module = matched[2], replacements = moved[module];
    const names = bindings.split(",").map(x => x.trim()).filter(Boolean);
    const keep = names.filter(name => !replacements[name.split(/\s+as\s+/)[0]]);
    const move = names.filter(name => replacements[name.split(/\s+as\s+/)[0]]);
    if (move.length === 0) return full;
    const output = [];
    if (keep.length) output.push("import { " + keep.join(", ") + " } from " + quote + source + quote + ";");
    for (const name of move) {
      output.push("import { " + name + " } from " + quote + prefix + replacements[name.split(/\s+as\s+/)[0]] + quote + ";");
    }
    return output.join("\n");
  });
  if (updated !== original) {
    fs.writeFileSync(file, updated);
    changed++;
    process.stdout.write(path.relative(root, file) + "\n");
  }
}
console.log("Rewrote helper imports in " + changed + " files.");
