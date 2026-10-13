import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const ui = path.join(root, "src/components/ui");
const read = name => fs.readFileSync(path.join(ui, name), "utf8");
const write = (name, contents) => fs.writeFileSync(path.join(ui, name), contents);
function must(condition, message) { if (!condition) throw new Error(message); }
function replaceExact(input, oldValue, newValue, label) {
  must(input.includes(oldValue), "Missing expected " + label);
  return input.replace(oldValue, newValue);
}
function moveVariant(file, symbol, newFile) {
  let source = read(file);
  const start = source.indexOf("const " + symbol + " = cva(");
  must(start >= 0, "Missing " + symbol);
  const end = source.indexOf("\n);", start);
  must(end >= 0, "Missing end for " + symbol);
  const declaration = source.slice(start, end + 3).replace("const " + symbol, "export const " + symbol);
  write(newFile, 'import { cva } from "class-variance-authority";\n\n' + declaration + "\n");
  source = source.slice(0, start) + source.slice(end + 3);
  source = source.replace(/import \{ cva, type VariantProps \} from "class-variance-authority";/, 'import { type VariantProps } from "class-variance-authority";');
  source = source.replace(/import \{ cva \} from "class-variance-authority";\n/, "");
  source = source.replace(/import \{ type VariantProps \} from "class-variance-authority";/, 'import type { VariantProps } from "class-variance-authority";');
  const prefix = file.replace(".tsx", "");
  source = 'import { ' + symbol + ' } from "./' + prefix + '-variants";\n' + source;
  source = source.replace(symbol + " };", "};");
  source = source.replace("export { " + symbol + ", ", "export { ");
  source = source.replace("  " + symbol + ",\n", "");
  write(file, source);
}
moveVariant("badge.tsx", "badgeVariants", "badge-variants.ts");
moveVariant("button.tsx", "buttonVariants", "button-variants.ts");
moveVariant("toggle.tsx", "toggleVariants", "toggle-variants.ts");
moveVariant("navigation-menu.tsx", "navigationMenuTriggerStyle", "navigation-menu-variants.ts");
moveVariant("sidebar.tsx", "sidebarMenuButtonVariants", "sidebar-variants.ts");

// Move sidebar's shared React context and hook out of the component module.
{
  let source = read("sidebar.tsx");
  const start = source.indexOf("type SidebarContextProps = {");
  const end = source.indexOf("const SidebarProvider = ", start);
  must(start >= 0 && end > start, "Sidebar context boundaries missing");
  const section = source.slice(start, end);
  const helper = 'import * as React from "react";\n\n' +
    section.replace("type SidebarContextProps =", "export type SidebarContextProps =")
      .replace("const SidebarContext = ", "export const SidebarContext = ")
      .replace("function useSidebar() {", "export function useSidebar() {");
  write("sidebar-context.tsx", helper);
  source = source.slice(0, start) + source.slice(end);
  source = 'import { SidebarContext, useSidebar, type SidebarContextProps } from "./sidebar-context";\n' + source;
  source = source.replace(/  useSidebar,\n};/, "};");
  write("sidebar.tsx", source);
}

// Move form hook and its two React contexts to a separate module.
{
  let source = read("form.tsx");
  const first = source.indexOf("type FormFieldContextValue<");
  const fieldStart = source.indexOf("const FormField = <", first);
  const hookStart = source.indexOf("const useFormField = () => {", fieldStart);
  const itemStart = source.indexOf("const FormItem = ", hookStart);
  must(first >= 0 && fieldStart > first && hookStart > fieldStart && itemStart > hookStart, "Form context boundaries missing");
  const fieldContext = source.slice(first, fieldStart);
  const hookAndItemContext = source.slice(hookStart, itemStart);
  const itemType = hookAndItemContext.slice(hookAndItemContext.indexOf("type FormItemContextValue ="));
  const hook = hookAndItemContext.slice(0, hookAndItemContext.indexOf("type FormItemContextValue ="));
  const helper = 'import * as React from "react";\nimport { useFormContext, type FieldValues, type FieldPath } from "react-hook-form";\n\n' +
    fieldContext.replace("const FormFieldContext = ", "export const FormFieldContext = ") +
    itemType.replace("const FormItemContext = ", "export const FormItemContext = ") +
    hook.replace("const useFormField = ", "export const useFormField = ");
  write("form-context.tsx", helper);
  source = source.slice(0, hookStart) + source.slice(itemStart);
  source = source.slice(0, first) + source.slice(fieldStart);
  source = source.replace("  useFormContext,\n", "");
  source = 'import { FormFieldContext, FormItemContext, useFormField } from "./form-context";\n' + source;
  source = source.replace(/  useFormField,\n/, "");
  write("form.tsx", source);
}

// Update all consumers of extracted helpers across app and tests.
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
  const out = [];
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ent.name === "node_modules" || ent.name === ".git") continue;
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) out.push(...walk(p));
    else if (/\.(tsx?|jsx?)$/.test(p)) out.push(p);
  }
  return out;
}
let changed = 0;
for (const file of [...walk(path.join(root, "src")), ...walk(path.join(root, "tests"))]) {
  if (file.startsWith(ui + path.sep) && /(?:-variants|-context)\.tsx?$/.test(file)) continue;
  const original = fs.readFileSync(file, "utf8");
  let updated = original.replace(/import\s*\{([\s\S]*?)\}\s*from\s*(["'])([^"']+)\2;?/g, (all, bindings, quote, sourcePath) => {
    const match = sourcePath.match(/(?:^|\/)ui\/(badge|button|toggle|navigation-menu|sidebar|form)$/);
    if (!match) return all;
    const remap = moved[match[1]];
    const names = bindings.split(",").map(x => x.trim()).filter(Boolean);
    const retained = names.filter(name => !remap[name.split(/\s+as\s+/)[0]]);
    const migrated = names.filter(name => remap[name.split(/\s+as\s+/)[0]]);
    if (migrated.length === 0) return all;
    const output = [];
    if (retained.length) output.push("import { " + retained.join(", ") + " } from " + quote + sourcePath + quote + ";");
    for (const name of migrated) {
      const destination = remap[name.split(/\s+as\s+/)[0]];
      output.push("import { " + name + " } from " + quote + sourcePath.replace(/[^/]+$/, destination) + quote + ";");
    }
    return output.join("\n");
  });
  // Local consumers in ui/* can import plain "./sidebar" etc.
  updated = updated.replace(/import\s*\{([\s\S]*?)\}\s*from\s*(["'])(\.\/)(badge|button|toggle|navigation-menu|sidebar|form)\2;?/g, (all, bindings, quote, rel, module) => {
    const remap = moved[module];
    const names = bindings.split(",").map(x => x.trim()).filter(Boolean);
    const retained = names.filter(name => !remap[name.split(/\s+as\s+/)[0]]);
    const migrated = names.filter(name => remap[name.split(/\s+as\s+/)[0]]);
    if (!migrated.length) return all;
    return [
      ...(retained.length ? ["import { " + retained.join(", ") + " } from " + quote + "./" + module + quote + ";"] : []),
      ...migrated.map(name => "import { " + name + " } from " + quote + "./" + remap[name.split(/\s+as\s+/)[0]] + quote + ";"),
    ].join("\n");
  });
  if (updated !== original) { fs.writeFileSync(file, updated); changed++; }
}
console.log("React Fast Refresh helpers extracted; updated imports in " + changed + " files.");
