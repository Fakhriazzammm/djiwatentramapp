import { expect, it } from "bun:test";
import { ErrorBoundary } from "./error-boundary";
import { handleGlobalNavigationKeyDown } from "../hooks/useGlobalKeyboardNavigation";

async function withBrowserEnvironment(run: () => void | Promise<void>) {
  const originalWindow = globalThis.window;
  const originalDocument = globalThis.document;
  const originalStorage = globalThis.sessionStorage;
  const originalError = console.error;
  try {
    console.error = () => {};
    await run();
  } finally {
    globalThis.window = originalWindow;
    globalThis.document = originalDocument;
    globalThis.sessionStorage = originalStorage;
    console.error = originalError;
  }
}

it("ordinary page failures wait for an explicit retry", () => withBrowserEnvironment(async () => {
  let timers = 0;
  let reloads = 0;
  globalThis.window = { setInterval: () => { timers++; return 1; }, location: { reload: () => reloads++ } } as any;
  const boundary = new ErrorBoundary({ children: null });
  boundary.setState = (() => {}) as any;
  boundary.componentDidCatch(new Error("Page failed"));
  expect(timers).toBe(0);
  expect(reloads).toBe(0);
  Object.assign(boundary.state, { hasError: true });
  boundary.setState = ((state: any) => Object.assign(boundary.state, state)) as any;
  const view = boundary.render() as any;
  view.props.children.props.children[2].props.children[0].props.onClick();
  expect(boundary.state.hasError).toBe(false);
  expect(reloads).toBe(0);
}));

it("an already attempted app update cannot start another automatic reload", () => withBrowserEnvironment(async () => {
  let reloads = 0;
  let timers = 0;
  globalThis.sessionStorage = { getItem: () => "1" } as any;
  globalThis.window = { setInterval: () => { timers++; return 1; }, location: { replace: () => reloads++ } } as any;
  const boundary = new ErrorBoundary({ children: null });
  boundary.setState = ((state: any) => Object.assign(boundary.state, state)) as any;
  boundary.componentDidCatch(new Error("ChunkLoadError"));
  await Promise.resolve();
  expect(boundary.state.hasError).toBe(true);
  expect(timers).toBe(0);
  expect(reloads).toBe(0);
}));

it("respects handled keys before reading focus or moving it", () => withBrowserEnvironment(async () => {
  globalThis.document = { get activeElement() { throw new Error("Focus should not be read"); } } as any;
  handleGlobalNavigationKeyDown({ defaultPrevented: true, key: "ArrowDown" } as KeyboardEvent);
}));

it("leaves every arrow key and Enter to editing, composite controls and dialogs", () => withBrowserEnvironment(async () => {
  for (const context of ["input", "textarea", "select", "[contenteditable]", "dialog", '[role="combobox"]', '[role="listbox"]', '[role="grid"]', '[role="tablist"]', '[role="dialog"]']) {
    for (const key of ["ArrowDown", "ArrowUp", "ArrowRight", "ArrowLeft", "Enter"]) {
      globalThis.document = {
        activeElement: { closest: (selector: string) => selector.includes(context) ? {} : null },
        querySelector: () => { throw new Error(`Must preserve keys in ${context}`); },
        querySelectorAll: () => { throw new Error("Must not navigate out of the control"); },
      } as any;
      handleGlobalNavigationKeyDown({ key, defaultPrevented: false, preventDefault: () => { throw new Error("Must preserve native behavior"); } } as any);
    }
  }
}));


it("keeps global arrow navigation available on ordinary buttons", () => withBrowserEnvironment(async () => {
  let focused = false;
  let prevented = false;
  const first = { closest: () => null };
  const second = { focus: () => { focused = true; } };
  const elements = [first, second].map((element) => Object.assign(element, {
    matches: () => false, closest: () => null, tabIndex: 0, getClientRects: () => [{}],
  }));
  globalThis.document = { activeElement: first, querySelector: () => null, querySelectorAll: () => elements } as any;
  globalThis.window = { getComputedStyle: () => ({ visibility: "visible" }) } as any;
  handleGlobalNavigationKeyDown({ key: "ArrowDown", preventDefault: () => { prevented = true; } } as KeyboardEvent);
  expect(focused).toBe(true);
  expect(prevented).toBe(true);
}));

it("attempts one automatic app download recovery and leaves further reloads to the user", () => withBrowserEnvironment(async () => {
  let replacements = 0;
  let manualReloads = 0;
  const values = new Map<string, string>();
  globalThis.sessionStorage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  } as any;
  globalThis.window = {
    location: { href: "https://pos.example/notifications", replace: () => replacements++, reload: () => manualReloads++ },
  } as any;
  const boundary = new ErrorBoundary({ children: null });
  boundary.setState = ((state: any) => Object.assign(boundary.state, state)) as any;
  boundary.componentDidCatch(new Error("ChunkLoadError"));
  await Promise.resolve();
  boundary.componentDidCatch(new Error("ChunkLoadError"));
  await Promise.resolve();
  expect(replacements).toBe(1);
  expect(manualReloads).toBe(0);
  const view = boundary.render() as any;
  view.props.children.props.children[2].props.children[0].props.onClick();
  expect(manualReloads).toBe(1);
}));
