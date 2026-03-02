import { loader } from "fumadocs-core/source";
import { docs, meta } from "@/.source/server";
import { toFumadocsSource } from "fumadocs-mdx/runtime/server";
import { icons } from "lucide-react";
import { createElement } from "react";

export const source = loader({
  baseUrl: "/docs",
  source: toFumadocsSource(docs, meta),
  icon(name) {
    if (!name) return;
    if (name in icons)
      return createElement(icons[name as keyof typeof icons]);
  },
});
