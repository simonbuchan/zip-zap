import { ZipWriter, type BuildOptions } from "@simonbuchan/zip-zap/write";

export interface EntryContentMap {
  readonly text: string;
  readonly file: File | null;
  readonly url: string;
}

export type EntryType = keyof EntryContentMap;

export interface TypedEntry<Type extends EntryType> {
  readonly type: Type;
  readonly id: number;
  readonly path: string;
  readonly content: EntryContentMap[Type];
  readonly compressed: boolean;
}

export type TextEntry = TypedEntry<"text">;
export type FileEntry = TypedEntry<"file">;
export type UrlEntry = TypedEntry<"url">;

export type Entry = TextEntry | FileEntry | UrlEntry;

export async function createZip(
  entries: readonly Entry[],
  options?: BuildOptions,
): Promise<Blob> {
  const writer = new ZipWriter();

  for (const entry of entries) {
    switch (entry.type) {
      case "file":
        writer.addBlob(entry.path, entry.content ?? new Blob(), {
          compressed: entry.compressed,
        });
        break;
      case "text":
        writer.addString(entry.path, entry.content, {
          compressed: entry.compressed,
        });
        break;
      case "url": {
        const res = await fetch(entry.content);
        if (!res.ok) {
          throw new Error(
            `Failed to fetch ${entry.content}: ${res.statusText}`,
          );
        }
        writer.addResponse(entry.path, res, {
          compressed: entry.compressed,
        });
        break;
      }
    }
  }

  return await writer.build(options);
}
