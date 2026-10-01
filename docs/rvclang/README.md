# RV32IM Clang-in-WASM POC

This proof of concept compiles one in-memory C source string into an ELF
relocatable object. The only supported target is `riscv32-unknown-elf` with
`rv32im` and `ilp32`.

The wrapper intentionally does not use the Clang driver, a linker, a libc,
headers, WASI, or a browser filesystem. Source and output stay in LLVM's
in-memory virtual filesystem. It rejects output unless its ELF header is
ELF32, `EM_RISCV`, and `ET_REL`.

## Exported C ABI

```c
int rvclang_compile(const char *source, size_t source_size);
void rvclang_clear_headers(void);
int rvclang_add_header(const char *path, size_t path_size,
                       const char *contents, size_t contents_size);
void rvclang_clear_args(void);
int rvclang_add_arg(const char *arg, size_t arg_size);
int rvclang_set_target(uint32_t target);
const unsigned char *rvclang_object_data(void);
size_t rvclang_object_size(void);
const char *rvclang_diagnostics(void);
```

`rvclang_compile` returns zero only after header validation. Copy the byte
range before the next invocation because the next compilation replaces it.

Add relative header paths through `rvclang_add_header` before compilation.
They are visible to `#include` under the virtual `/project` include root;
absolute paths, backslashes, `.` and `..` path components are rejected.

Add cc1 options one string at a time with `rvclang_add_arg` before compiling;
for example `-O2`, `-DNAME=42`, or `-std=c11`. `rvclang_clear_args` resets
the staged options. The wrapper appends its fixed input and output arguments
after the staged values.

Select a target before compiling: `0` is `riscv32-unknown-elf`, `rv32im`,
`ilp32`; `1` is `riscv64-unknown-elf`, `rv64gc`, `lp64d`.

## Build

Run `scripts/build-poc.ps1 -EmsdkRoot <emsdk-root>`. The script first builds
native TableGen tools, then cross-compiles Clang and the POC with Emscripten.
