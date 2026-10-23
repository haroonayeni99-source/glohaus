import { copyFile, mkdir, readdir, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export async function prepareMapWorker() {
  const source = dirname(fileURLToPath(import.meta.resolve("maplibre-gl")));
  const destination = fileURLToPath(
    new URL("../public/vendor/maplibre/", import.meta.url),
  );
  await rm(destination, { recursive: true, force: true });
  await mkdir(destination, { recursive: true });
  for (const name of await readdir(source)) {
    if (name.endsWith(".mjs"))
      await copyFile(join(source, name), join(destination, name));
  }
  await copyFile(
    join(source, "../LICENSE.txt"),
    join(destination, "LICENSE.txt"),
  );
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  await prepareMapWorker();
}
