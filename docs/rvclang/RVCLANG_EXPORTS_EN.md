# `rvclang-wasm`: `_rvclang_*` exports reference

This is the low-level C API of the module. JavaScript exposes these functions
as `mod._rvclang_*`. Text and binary arguments use a `(ptr, size)` pair:
`ptr` points at the beginning of data in `mod.HEAPU8`, and `size` is the byte
count. Strings do **not** need a trailing `\0`.

Use the exported Emscripten functions `mod._malloc(size)` and `mod._free(ptr)`
to write data into WASM memory. Always obtain `.o` and ELF results with
`mod.HEAPU8.slice(ptr, ptr + size)`: a later compilation or link replaces the
internal result buffer.

## Status and diagnostics

Almost every state-changing function returns `0` on success and a non-zero
value on failure. Read the text after an error with:

```js
const text = mod.UTF8ToString(mod._rvclang_diagnostics());
```

Clang and LLD also forward the same text to the `printErr` callback supplied
to `await createRvClang({ printErr })`.

## Target selection

| Export | Signature | Description |
| --- | --- | --- |
| `_rvclang_set_target` | `(target) -> int` | Selects the target before compilation and linking. `0`: `riscv32-unknown-elf`, `rv32im`, `ilp32`; `1`: `riscv64-unknown-elf`, `rv64gc`, `lp64d`. Any other value returns `1`. |

## Compilation

| Export | Signature | Description |
| --- | --- | --- |
| `_rvclang_compile` | `(sourcePtr, sourceSize) -> int` | Compiles C bytes into a relocatable RISC-V ELF `.o`. Diagnostics use `input.c` as the source name. |
| `_rvclang_compile_file` | `(namePtr, nameSize, sourcePtr, sourceSize) -> int` | Same operation with a source name such as `src/main.c`. Errors include `src/main.c:line:column`. The name must be relative and cannot contain `..`, `\\`, or `:`. |
| `_rvclang_compile_asm_file` | `(namePtr, nameSize, sourcePtr, sourceSize) -> int` | Compiles assembly through the C preprocessor: `#define` and `#include` work. Functionally this is `.S`. The extension is not checked, so a GMod-lowercased name such as `start.s` is accepted and still processed as `.S`. |
| `_rvclang_object_data` | `() -> ptr` | Pointer to the most recently generated `.o`; `0` when no result exists. |
| `_rvclang_object_size` | `() -> size` | Byte size of the most recent `.o`. |

Successful operations report `rvclang: compiled object N bytes` or
`rvclang: assembled object N bytes` via `print`.

## Virtual headers

Headers exist only in memory for one WASM instance. During compilation, each
added file is visible at `/project/<path>`.

| Export | Signature | Description |
| --- | --- | --- |
| `_rvclang_add_header` | `(pathPtr, pathSize, contentsPtr, contentsSize) -> int` | Adds a virtual header. For example add `include/riscv.h`, pass `-I/project/include`, then use `#include "riscv.h"`. The path must be relative and cannot contain `..`, `\\`, or `:`. |
| `_rvclang_clear_headers` | `() -> void` | Removes every virtual header. |

## Extra Clang flags

| Export | Signature | Description |
| --- | --- | --- |
| `_rvclang_add_arg` | `(argPtr, argSize) -> int` | Adds one argument specifically for `clang -cc1`, for example `-O2`, `-I/project/include`, or `-debug-info-kind=standalone`. It may be called multiple times and order is preserved. Do not use driver arguments such as `-g` or `-march=...`. |
| `_rvclang_clear_args` | `() -> void` | Clears user-supplied cc1 arguments. |

The wrapper appends its fixed triple, CPU, ABI, language, and `-emit-obj`
arguments after custom flags. A caller cannot override the selected RV32/RV64
target profile.

## Link input set

| Export | Signature | Description |
| --- | --- | --- |
| `_rvclang_clear_link_objects` | `() -> void` | Clears the input `.o` list. Call before every new link. |
| `_rvclang_add_link_object` | `(namePtr, nameSize, dataPtr, dataSize) -> int` | Copies an object from WASM memory into the link-input set. `name` must be a simple filename such as `main.o`: no `/`, `\\`, `:`, or NUL. Check the returned status. |
| `_rvclang_link_objects` | `() -> int` | Links every accumulated `.o` into a RISC-V `ET_EXEC` ELF. |
| `_rvclang_link_current` | `() -> int` | Links only the most recently compiled object. Useful for a one-file program. |

## Linker script and entry point

| Export | Signature | Description |
| --- | --- | --- |
| `_rvclang_set_linker_script` | `(scriptPtr, scriptSize) -> int` | Sets a linker script, equivalent to `ld.lld -T script.ld`. It is required for bare-metal RAM/Flash addresses and section layout. |
| `_rvclang_clear_linker_script` | `() -> void` | Disables a previously configured script. |
| `_rvclang_set_entry` | `(namePtr, nameSize) -> int` | Changes the ELF entry symbol. The default is `main`; bare-metal code normally uses `_start`. The name must be a simple symbol: no `/`, `\\`, `:`, or NUL. |
| `_rvclang_executable_data` | `() -> ptr` | Pointer to the most recently linked `ET_EXEC` ELF. |
| `_rvclang_executable_size` | `() -> size` | Byte size of the most recent ELF. |

Internally, LLD is invoked approximately as:

```text
ld.lld -m elf32lriscv -e <entry> [-T script.ld] -o output.elf input.o ...
```

RV64 uses `-m elf64lriscv`. The current export returns ELF only; flat binary
output (`--oformat=binary`) has not yet been exposed as a separate API.

## Diagnostics

| Export | Signature | Description |
| --- | --- | --- |
| `_rvclang_diagnostics` | `() -> ptr` | Pointer to NUL-terminated UTF-8 text containing the latest Clang or LLD warnings/errors. Read it through `mod.UTF8ToString(ptr)`. The string changes on the next operation. |

## Minimal flow

```js
mod._rvclang_set_target(0); // RV32IM / ilp32

const mainObject = compileFile(mod, 'src/main.c', mainSource);
const startObject = compileAsmFile(mod, 'src/start.s', startSource);

mod._rvclang_clear_link_objects();
addObject(mod, 'start.o', startObject);
addObject(mod, 'main.o', mainObject);
setText(mod, '_start', (ptr, size) => mod._rvclang_set_entry(ptr, size));
setText(mod, linkerScript, (ptr, size) =>
  mod._rvclang_set_linker_script(ptr, size)
);

if (mod._rvclang_link_objects() !== 0)
  throw new Error(mod.UTF8ToString(mod._rvclang_diagnostics()));

const elf = mod.HEAPU8.slice(
  mod._rvclang_executable_data(),
  mod._rvclang_executable_data() + mod._rvclang_executable_size(),
);
```

`compileFile`, `compileAsmFile`, `addObject`, and `setText` in this example
are short JS wrappers for `malloc` / copy / `free`; ready-to-use variants are
available in [API.md](API.md).

## Current POC limitations

- There is no libc, sysroot, or system include directory.
- `printf` is not implemented; UART output requires custom bare-metal code.
- `.bss` has no bytes in the ELF file; startup code must clear it when needed.
- After a successful LLD invocation, the current WASM instance does not
  reliably support a second independent link. Create a new instance for the
  next build.
