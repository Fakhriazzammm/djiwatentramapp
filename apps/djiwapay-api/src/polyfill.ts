// The mail receiver runs on the VPS's Node 18, which has no global File (a dependency expects it).
import { File } from "node:buffer";
(globalThis as { File?: unknown }).File ??= File;
