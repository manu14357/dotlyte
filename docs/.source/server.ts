// @ts-nocheck
import { default as __fd_glob_20 } from "../content/docs/meta.json?collection=meta"
import * as __fd_glob_19 from "../content/docs/languages/rust.mdx?collection=docs"
import * as __fd_glob_18 from "../content/docs/languages/ruby.mdx?collection=docs"
import * as __fd_glob_17 from "../content/docs/languages/python.mdx?collection=docs"
import * as __fd_glob_16 from "../content/docs/languages/php.mdx?collection=docs"
import * as __fd_glob_15 from "../content/docs/languages/javascript.mdx?collection=docs"
import * as __fd_glob_14 from "../content/docs/languages/java.mdx?collection=docs"
import * as __fd_glob_13 from "../content/docs/languages/go.mdx?collection=docs"
import * as __fd_glob_12 from "../content/docs/languages/dotnet.mdx?collection=docs"
import * as __fd_glob_11 from "../content/docs/api/options.mdx?collection=docs"
import * as __fd_glob_10 from "../content/docs/api/load.mdx?collection=docs"
import * as __fd_glob_9 from "../content/docs/api/errors.mdx?collection=docs"
import * as __fd_glob_8 from "../content/docs/api/config.mdx?collection=docs"
import * as __fd_glob_7 from "../content/docs/type-coercion.mdx?collection=docs"
import * as __fd_glob_6 from "../content/docs/quick-start.mdx?collection=docs"
import * as __fd_glob_5 from "../content/docs/priority-order.mdx?collection=docs"
import * as __fd_glob_4 from "../content/docs/installation.mdx?collection=docs"
import * as __fd_glob_3 from "../content/docs/index.mdx?collection=docs"
import * as __fd_glob_2 from "../content/docs/getting-started.mdx?collection=docs"
import * as __fd_glob_1 from "../content/docs/environment-files.mdx?collection=docs"
import * as __fd_glob_0 from "../content/docs/contributing.mdx?collection=docs"
import { server } from 'fumadocs-mdx/runtime/server';
import type * as Config from '../source.config';

const create = server<typeof Config, import("fumadocs-mdx/runtime/types").InternalTypeConfig & {
  DocData: {
  }
}>({"doc":{"passthroughs":["extractedReferences"]}});

export const docs = await create.doc("docs", "content/docs", {"contributing.mdx": __fd_glob_0, "environment-files.mdx": __fd_glob_1, "getting-started.mdx": __fd_glob_2, "index.mdx": __fd_glob_3, "installation.mdx": __fd_glob_4, "priority-order.mdx": __fd_glob_5, "quick-start.mdx": __fd_glob_6, "type-coercion.mdx": __fd_glob_7, "api/config.mdx": __fd_glob_8, "api/errors.mdx": __fd_glob_9, "api/load.mdx": __fd_glob_10, "api/options.mdx": __fd_glob_11, "languages/dotnet.mdx": __fd_glob_12, "languages/go.mdx": __fd_glob_13, "languages/java.mdx": __fd_glob_14, "languages/javascript.mdx": __fd_glob_15, "languages/php.mdx": __fd_glob_16, "languages/python.mdx": __fd_glob_17, "languages/ruby.mdx": __fd_glob_18, "languages/rust.mdx": __fd_glob_19, });

export const meta = await create.meta("meta", "content/docs", {"meta.json": __fd_glob_20, });