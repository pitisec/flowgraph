import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
export const fileUrl = rel => pathToFileURL(path.join(ROOT, rel)).href;

/* Zbiera błędy strony i konsoli. Fonty z Google bywają niedostępne (CI bez sieci) i to nie jest błąd aplikacji. */
export function watchErrors(page) {
  const errors = [];
  page.on("pageerror", e => errors.push(`pageerror: ${e.message}`));
  page.on("console", m => {
    if (m.type() === "error" && !/fonts\.(googleapis|gstatic)\.com|ERR_INTERNET_DISCONNECTED|ERR_NAME_NOT_RESOLVED/.test(m.text() + (m.location()?.url || ""))) errors.push(`console: ${m.text()}`);
  });
  return errors;
}
