import path from "path";

export function getDataPath(): string {
  return (
    process.env.DATA_PATH?.trim() ||
    path.join(/* turbopackIgnore: true */ process.cwd(), ".data")
  );
}
