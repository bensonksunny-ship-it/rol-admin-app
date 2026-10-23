/**
 * Comparison key for a sub-department name. Team members store their sub-departments
 * as name strings, and directors free-type those names, so matching tolerates case,
 * whitespace, and a trailing plural "s" ("light shiner", "Light Shiners ", "Light
 * Shiner" are all the same sub-department).
 */
export function subDeptMatchKey(name) {
  return String(name || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/s$/, '')
}
