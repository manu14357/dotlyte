import { source } from "@/lib/source";
import { createFromSource } from "fumadocs-core/search/server";
import { structure } from "fumadocs-core/mdx-plugins";
import type { StructuredData } from "fumadocs-core/mdx-plugins";

export const { GET } = createFromSource(source, {
  buildIndex: async (page) => {
    let structuredData: StructuredData | undefined;

    // Try direct access from compiled MDX
    if (
      "structuredData" in page.data &&
      page.data.structuredData != null
    ) {
      structuredData = page.data.structuredData as StructuredData;
    }

    // Try lazy-loaded data
    if (
      !structuredData &&
      "load" in page.data &&
      typeof page.data.load === "function"
    ) {
      try {
        const loaded = await (page.data as { load: () => Promise<{ structuredData?: StructuredData }> }).load();
        structuredData = loaded?.structuredData;
      } catch {
        // ignore load errors
      }
    }

    // Fallback: read the raw MDX file and generate structured data
    if (!structuredData) {
      try {
        const text = await page.data.getText("raw");
        structuredData = structure(text);
      } catch {
        // Final fallback: minimal structured data from metadata
        structuredData = {
          headings: [],
          contents: [
            {
              heading: undefined,
              content:
                ((page.data as unknown as Record<string, unknown>).description as string) ??
                "",
            },
          ],
        };
      }
    }

    return {
      id: page.url,
      title: ((page.data as unknown as Record<string, unknown>).title as string) ?? "",
      description:
        (page.data as unknown as Record<string, unknown>).description as string | undefined,
      url: page.url,
      structuredData,
    };
  },
});
