import { createRoot } from "react-dom/client";
import { StrictMode } from "react";
import { jsx } from "react/jsx-runtime";

import App from "./App";

const root = createRoot(document.getElementById("root")!);

root.render(jsx(StrictMode, { children: jsx(App, {}) }));
