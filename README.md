# RVEditor

Browser-based RISC-V C/ASM project editor intended for Garry's Mod DHTML/CEF. It manages projects, files, build output paths, Monaco tabs, and the Lua RPC bridge. Toolchain integration is experimental.

## Layout

- `src/editor/` — editor entry point and UI orchestration.
- `src/app/` — bridge, persistent state, and UI components.
- `src/toolchain/` — RISC-V toolchain wrapper and bundled RVClang WASM runtime.
- `src/preview/` — in-memory browser mock for testing outside Garry's Mod.
- `HTML_EDITOR_API.md` — public JavaScript/Lua bridge API (kept at this path for the Garry's Mod addon).
- `docs/` — RVClang notes.
- `tools/` — manual WASM experiments.
- `legacy/` — previous Monaco prototype; it is not loaded by the application.

## Local preview

```sh
npm install
npm run dev
```

The normal page includes `src/preview/browser_mock.js`, so it can run in a regular browser when the Garry's Mod bridge is unavailable.

## Production check

```sh
npm run build
```

See [HTML editor bridge API](HTML_EDITOR_API.md).
