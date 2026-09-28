import { realpath } from "node:fs/promises";
import { dirname, join, relative, resolve, basename, isAbsolute, sep } from "node:path";

async function physicalPath(path: string): Promise<string> {
  try { return await realpath(path); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT" || dirname(path) === path) throw error;
    return join(await physicalPath(dirname(path)), basename(path));
  }
}

/** Evidence persistence only; does not change browser actions or coordinator semantics.
 * Temporary test destinations remain supported. Inside this repository's evidence tree,
 * raw writers may only use runtime/. Resolve existing symlinks before checking.
 */
export async function assertPrivateEvidenceDestination(directory: string, repositoryRoot = process.cwd()): Promise<void> {
  const publicPath = (root: string, destination: string): boolean => {
    const subpath = relative(root, destination);
    const inside = subpath === "" || (subpath !== ".." && !subpath.startsWith(`..${sep}`) && !isAbsolute(subpath));
    return inside && subpath !== "runtime" && !subpath.startsWith(`runtime${sep}`);
  };
  const root = resolve(repositoryRoot, "evidence");
  const destination = resolve(directory);
  if (publicPath(root, destination) || publicPath(await physicalPath(root), await physicalPath(destination))) {
    throw new Error("Raw evidence cannot be written to public evidence paths");
  }
}
