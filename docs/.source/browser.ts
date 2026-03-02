// @ts-nocheck
import { browser } from 'fumadocs-mdx/runtime/browser';
import type * as Config from '../source.config';

const create = browser<typeof Config, import("fumadocs-mdx/runtime/types").InternalTypeConfig & {
  DocData: {
  }
}>();
const browserCollections = {
  docs: create.doc("docs", {"contributing.mdx": () => import("../content/docs/contributing.mdx?collection=docs"), "environment-files.mdx": () => import("../content/docs/environment-files.mdx?collection=docs"), "getting-started.mdx": () => import("../content/docs/getting-started.mdx?collection=docs"), "index.mdx": () => import("../content/docs/index.mdx?collection=docs"), "installation.mdx": () => import("../content/docs/installation.mdx?collection=docs"), "priority-order.mdx": () => import("../content/docs/priority-order.mdx?collection=docs"), "quick-start.mdx": () => import("../content/docs/quick-start.mdx?collection=docs"), "type-coercion.mdx": () => import("../content/docs/type-coercion.mdx?collection=docs"), "api/config.mdx": () => import("../content/docs/api/config.mdx?collection=docs"), "api/errors.mdx": () => import("../content/docs/api/errors.mdx?collection=docs"), "api/load.mdx": () => import("../content/docs/api/load.mdx?collection=docs"), "api/options.mdx": () => import("../content/docs/api/options.mdx?collection=docs"), "languages/dotnet.mdx": () => import("../content/docs/languages/dotnet.mdx?collection=docs"), "languages/go.mdx": () => import("../content/docs/languages/go.mdx?collection=docs"), "languages/java.mdx": () => import("../content/docs/languages/java.mdx?collection=docs"), "languages/javascript.mdx": () => import("../content/docs/languages/javascript.mdx?collection=docs"), "languages/php.mdx": () => import("../content/docs/languages/php.mdx?collection=docs"), "languages/python.mdx": () => import("../content/docs/languages/python.mdx?collection=docs"), "languages/ruby.mdx": () => import("../content/docs/languages/ruby.mdx?collection=docs"), "languages/rust.mdx": () => import("../content/docs/languages/rust.mdx?collection=docs"), }),
};
export default browserCollections;