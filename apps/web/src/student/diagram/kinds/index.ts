/** Every kind of live diagram, by its `kind` (docs/plans/doodles-v2-contract.md sections 8 and 9). */

import type { DiagramKind } from "../../api.js";
import type { KindModule } from "../engine.js";
import { bar } from "./bar.js";
import { graph } from "./graph.js";
import { ladder } from "./ladder.js";
import { numberline } from "./numberline.js";
import { ogive } from "./ogive.js";
import { pie } from "./pie.js";
import { table } from "./table.js";
import { tree } from "./tree.js";
import { venn } from "./venn.js";

export const KINDS: Record<DiagramKind, KindModule> = {
  graph,
  venn,
  pie,
  bar,
  histogram: bar,
  numberline,
  tree,
  table,
  ogive,
  ladder,
};
