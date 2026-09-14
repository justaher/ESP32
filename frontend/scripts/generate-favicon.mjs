import { writeFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Zap } from "lucide-react";
writeFileSync(
  new URL("../public/favicon.svg", import.meta.url),
  renderToStaticMarkup(createElement(Zap, { color: "#ffab53", size: 32 })),
);
