# HTML Editor API

This document describes the public integration surface between the RISC-V editor page and Garry's Mod Lua. Keep it in sync with `host_ui.js` and `riscv_editor_host.lua`.

## Browser preview mock

`browser_mock.js` provides an in-memory implementation of `gmod.request` when the page is opened outside Garry's Mod. It seeds **Assembler Test** and **C Example**, supports every operation in the table below, and calls `RVHost.start()` automatically. It does not run when Garry's Mod already supplies `window.gmod.request`; no project data is written to disk in browser preview mode.

## JavaScript UI API

`window.RVEditorUI` is intended for future compiler and deployment code. UI functions only change the interface; `writeBinaryFile` stores an already-built binary through the Lua bridge.

### `RVEditorUI.appendBuildLog(message)`

Appends one line to Build Log. The initial placeholder is removed automatically.

| Parameter | Type | Description |
| --- | --- | --- |
| `message` | `string` | Text to append. Any value is converted to a string. |

```js
RVEditorUI.appendBuildLog("gas: assembling main.s");
RVEditorUI.appendBuildLog("main.s:10: error: invalid instruction");
```

### `RVEditorUI.clearBuildLog()`

Clears all Build Log output.

```js
RVEditorUI.clearBuildLog();
```

### `RVEditorUI.writeBinaryFile(project, path, data)`

Writes binary data into a project file. `data` may be a `Uint8Array`, `ArrayBuffer`, another typed-array view, or a regular array of bytes. The UI encodes it as base64 and invokes the `writeBinaryFile` RPC. It resolves to `{ saved: true, byte_length: number }`.

```js
const elf = toolchain.link();
await RVEditorUI.writeBinaryFile(project.id, project.build.output_file, elf);
```

### `RVEditorUI.closeActiveDialog()`

Cancels the visible custom HTML dialog, if one exists. Returns `true` when a dialog was closed and `false` otherwise. Lua invokes this after `GM:OnPauseMenuShow` intercepts Escape, so the pause menu is blocked only while a DHTML dialog is active.

```js
RVEditorUI.closeActiveDialog();
```

### `RVEditorUI.showBuildLog()` / `RVEditorUI.hideBuildLog()`

Opens or collapses the Build Log panel.

```js
RVEditorUI.showBuildLog();
```

## HTML-to-Lua RPC bridge

The page sends asynchronous requests through `gmod.request(requestId, operation, payloadJson)`. Lua returns a JSON string through `RVHost.resolve(requestId, responseJson)`.

### Response format

```json
{ "ok": true, "data": {} }
```

```json
{ "ok": false, "error": "Human-readable error" }
```

`window.RVHost.start()` initializes project loading after DHTML is ready. `window.RVHost.resolve` is reserved for Lua responses.

### Dialog-state callback

`gmod.setDialogOpen(isOpen)` is a fire-and-forget DHTML-to-Lua callback, not an RPC request. The page calls it whenever a custom dialog opens or closes. Lua uses that state in `GM:OnPauseMenuShow` to close the dialog through `RVEditorUI.closeActiveDialog()` and return `false`, preventing the pause menu for that Escape press.

### Operations

| Operation | Request payload | Successful response |
| --- | --- | --- |
| `listProjects` | `{}` | `{ "projects": Project[], "issues": Issue[] }` |
| `getWorkspaceState` | `{}` | `{ "state": WorkspaceState }` |
| `saveWorkspaceState` | `{ "state": WorkspaceState }` | `{ "saved": true }` |
| `resetWorkspaceState` | `{}` | `{ "reset": true }` |
| `readFile` | `{ "project", "path" }` | `{ "content" }` |
| `writeFile` | `{ "project", "path", "content" }` | `{ "saved": true }` |
| `writeBinaryFile` | `{ "project", "path", "content_base64" }` | `{ "saved": true, "byte_length": number }` |
| `createProject` | `{ "id", "name", "preset" }` | `{ "project": Project }` |
| `createFile` | `{ "project", "path" }` | `{ "created": true }` |
| `renameFile` | `{ "project", "oldPath", "newPath" }` | `{ "renamed": true }` |
| `deleteFile` | `{ "project", "path" }` | `{ "deleted": true }` |
| `createDirectory` | `{ "project", "path" }` | `{ "created": true }` |
| `renameDirectory` | `{ "project", "oldPath", "newPath" }` | `{ "renamed": true }` |
| `deleteDirectory` | `{ "project", "path" }` | `{ "deleted": true }` |
| `updateProjectSettings` | `{ "project", "name", "compiler", "build" }` | `{ "project": Project }` |
| `renameProject` | `{ "oldId", "newId" }` | `{ "project": Project }` |
| `deleteProject` | `{ "project" }` | `{ "deleted": true }` |

`preset` is a creation template only: it creates the initial C, ASM, or empty file set. It is not changed by `updateProjectSettings`.

`path`, `oldPath`, and `newPath` are safe relative paths within a project and use `/`, for example `src/main.s` or `include/riscv`. File and directory names cannot use `.` or `..` segments. `deleteDirectory` deliberately accepts empty directories only; remove or move its contents first.

## Workspace state

`WorkspaceState` is stored separately as `riscv/editor_workspace.txt` in Garry's Mod `DATA`. It restores the open tabs, the active tab, the last successfully built `active_project`, collapsed project/directory nodes, the project-tree width, the last open Build Log height, and VGUI window bounds when the editor is opened again. `active_project` is the project a chip should launch; it is not merely the currently selected tree item. `sidebar_width` and `build_log_height` are pixel values; invalid or absent values use the defaults. Lua clamps `window` to the current `ScrW()` and `ScrH()` before creating the frame, so a window saved on a larger display cannot open outside the screen.

```json
{
  "open_files": [{ "project": "assembler-test", "path": "src/main.s" }],
  "active_file": { "project": "assembler-test", "path": "src/main.s" },
  "active_project": "assembler-test",
  "collapsed_projects": ["c-example"],
  "collapsed_directories": [{ "project": "assembler-test", "path": "include" }],
  "sidebar_width": 280,
  "build_log_height": 220,
  "window": { "x": 80, "y": 60, "width": 1440, "height": 820 }
}
```

## Project metadata

`Project` contains `id`, `name`, `preset`, `author`, `files`, `directories`, `compiler`, and `build`. New projects create an empty `build/` directory. `files` and `directories` are relative slash-separated paths; `directories` includes empty folders so the UI can render them. Compiler and build settings are stored but are not consumed by the current build implementation.

```json
{
  "compiler": {
    "gas": {
      "target": "riscv64-linux-gnu",
      "march": "rv64gc",
      "mabi": "lp64d",
      "extra_args": ""
    },
    "tinycc": {
      "target": "",
      "extra_args": ""
    }
  },
  "build": {
    "objects_dir": "build",
    "output_file": "build/output.elf"
  }
}
```
