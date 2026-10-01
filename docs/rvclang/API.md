# rvclang-wasm: минимальный API

`rvclang-wasm` — Clang и LLD, собранные в WebAssembly. Он компилирует C-код
в RISC-V ELF object (`.o`) и линкует несколько таких объектов в исполняемый
RISC-V ELF.

Сейчас доступны две цели:

| Значение | Цель Clang | ISA и ABI |
| --- | --- | --- |
| `0` | `riscv32-unknown-elf` | `rv32im`, `ilp32` |
| `1` | `riscv64-unknown-elf` | `rv64gc`, `lp64d` |

## Загрузка

```js
import createRvClang from '../../src/toolchain/rvclang/rvclang-wasm.mjs';

const mod = await createRvClang({
  // Необязательно, если .wasm лежит рядом с .mjs.
  locateFile: name => new URL(name, import.meta.url).href,
  printErr: text => console.error('[rvclang]', text),
});
```

`await` возвращается только после полной инициализации WASM.

`print` получает краткие сообщения об успешной компиляции и линковке.
`printErr` получает warnings и errors Clang/LLD. Тот же текст остаётся
доступен через `_rvclang_diagnostics()`.

## Список функций

Все функции ниже вызываются у `mod`. Указатели `ptr` — адреса в `mod.HEAPU8`;
для строк и байт удобно использовать `withUtf8` / `withBytes` из следующего
раздела.

| Функция | Краткое описание |
| --- | --- |
| `_malloc(size)` | Выделяет `size` байт в памяти WASM и возвращает указатель. |
| `_free(ptr)` | Освобождает память, выделенную `_malloc`. |
| `_rvclang_set_target(target)` | Выбирает `0` для RV32IM/ilp32 или `1` для RV64GC/lp64d. |
| `_rvclang_compile(sourcePtr, sourceSize)` | Компилирует C-байты в последний `.o`. Возвращает `0` при успехе. |
| `_rvclang_compile_file(namePtr, nameSize, sourcePtr, sourceSize)` | То же, но задаёт имя исходника для diagnostics, например `main.c:9:3: error: …`. |
| `_rvclang_compile_asm_file(namePtr, nameSize, sourcePtr, sourceSize)` | Компилирует `.S`: assembly с C preprocessor (`#define`, `#include`). |
| `_rvclang_object_data()` | Возвращает указатель на последний object file. |
| `_rvclang_object_size()` | Возвращает размер последнего object file. |
| `_rvclang_clear_headers()` | Удаляет все виртуальные заголовки. |
| `_rvclang_add_header(pathPtr, pathSize, contentsPtr, contentsSize)` | Добавляет файл для `#include "..."` в виртуальный проект. |
| `_rvclang_clear_args()` | Удаляет дополнительные cc1-флаги. |
| `_rvclang_add_arg(argPtr, argSize)` | Добавляет один дополнительный флаг Clang, например `-O2`. |
| `_rvclang_clear_link_objects()` | Очищает список `.o`, которые будут переданы в линкер. |
| `_rvclang_add_link_object(namePtr, nameSize, objectPtr, objectSize)` | Копирует именованный `.o` в список входов линкера. |
| `_rvclang_link_objects()` | Линкует все добавленные `.o` в RISC-V ELF executable. |
| `_rvclang_link_current()` | Линкует только последний объект, полученный через `compile`. |
| `_rvclang_set_linker_script(scriptPtr, scriptSize)` | Устанавливает текст linker script, эквивалентный `lld -T script.ld`. |
| `_rvclang_clear_linker_script()` | Отключает ранее заданный linker script. |
| `_rvclang_set_entry(namePtr, nameSize)` | Меняет entry point; по умолчанию это `main`. |
| `_rvclang_executable_data()` | Возвращает указатель на готовый ELF после линковки. |
| `_rvclang_executable_size()` | Возвращает размер готового ELF. |
| `_rvclang_diagnostics()` | Возвращает указатель на UTF-8 строку с ошибками/предупреждениями Clang или LLD. |
| `UTF8ToString(ptr)` | Emscripten helper: превращает `char*` из WASM в JS-строку. |

## Основной поток

```text
C source → rvclang_compile → .o bytes
несколько .o bytes + optional linker script → rvclang_link_objects → ELF bytes
```

Низкоуровневый API принимает указатели в памяти WASM. Эти две JS-функции
убирают повторяющийся `malloc` / `free`:

```js
const encoder = new TextEncoder();

function withUtf8(mod, text, callback) {
  const bytes = encoder.encode(text);
  const ptr = mod._malloc(bytes.length);
  try {
    mod.HEAPU8.set(bytes, ptr);
    return callback(ptr, bytes.length);
  } finally {
    mod._free(ptr);
  }
}

function withBytes(mod, bytes, callback) {
  const ptr = mod._malloc(bytes.length);
  try {
    mod.HEAPU8.set(bytes, ptr);
    return callback(ptr, bytes.length);
  } finally {
    mod._free(ptr);
  }
}
```

## Выбор цели

```js
mod._rvclang_set_target(0); // RV32IM / ilp32
// mod._rvclang_set_target(1); // RV64GC / lp64d
```

Функция возвращает `0` при успехе, `1` при неизвестном значении.

## Компиляция C в `.o`

```js
function compile(mod, source) {
  const status = withUtf8(mod, source, (ptr, size) =>
    mod._rvclang_compile(ptr, size)
  );

  if (status !== 0) {
    throw new Error(mod.UTF8ToString(mod._rvclang_diagnostics()));
  }

  const ptr = mod._rvclang_object_data();
  const size = mod._rvclang_object_size();

  // slice создаёт копию: результат переживёт следующую компиляцию.
  return mod.HEAPU8.slice(ptr, ptr + size);
}
```

`rvclang_compile` использует имя `input.c`. Для нормальных diagnostics лучше
использовать `_rvclang_compile_file`:

```js
function compileFile(mod, name, source) {
  return withUtf8(mod, name, (namePtr, nameSize) =>
    withUtf8(mod, source, (sourcePtr, sourceSize) =>
      mod._rvclang_compile_file(namePtr, nameSize, sourcePtr, sourceSize)
    )
  );
}

// При ошибке: main.c:9:3: error: ...
const status = compileFile(mod, 'main.c', 'int main(void) { return ; }');
```

Последний полученный объект доступен через:

```js
mod._rvclang_object_data(); // uint8_t* в памяти WASM
mod._rvclang_object_size(); // размер в байтах
```

## Линковка нескольких объектов

Сначала очищается набор входов. Затем в него добавляются `.o` как независимые
копии. Имя — только простое имя файла, например `main.o` или `uart.o`: без
`/`, `\\` и `:`.

```js
function addObject(mod, name, objectBytes) {
  return withUtf8(mod, name, (namePtr, nameSize) =>
    withBytes(mod, objectBytes, (objectPtr, objectSize) =>
      mod._rvclang_add_link_object(
        namePtr, nameSize,
        objectPtr, objectSize,
      )
    )
  );
}

function link(mod) {
  const status = mod._rvclang_link_objects();
  if (status !== 0) {
    throw new Error(mod.UTF8ToString(mod._rvclang_diagnostics()));
  }

  const ptr = mod._rvclang_executable_data();
  const size = mod._rvclang_executable_size();
  return mod.HEAPU8.slice(ptr, ptr + size);
}
```

Пример:

```js
mod._rvclang_set_target(0);

const helper = compile(mod, `
  int helper(void) { return 7; }
`);

const main = compile(mod, `
  int helper(void);
  int main(void) { return helper(); }
`);

mod._rvclang_clear_link_objects();
addObject(mod, 'helper.o', helper);
addObject(mod, 'main.o', main);

const elf = link(mod); // Uint8Array с RISC-V ET_EXEC ELF
```

Для быстрого случая с одним последним `.o` остаётся:

```js
mod._rvclang_link_current();
```

## Linker script и entry point

По умолчанию entry point — `main`. Его можно изменить, например для startup
кода с `_start`:

```js
withUtf8(mod, '_start', (ptr, size) =>
  mod._rvclang_set_entry(ptr, size)
);
```

Linker script передаётся текстом и используется как `lld -T script.ld`:

```js
const script = `
  ENTRY(_start)
  SECTIONS {
    . = 0x80000000;
    .text : { *(.text .text.*) }
    .rodata : { *(.rodata .rodata.*) }
    .data : { *(.data .data.*) }
    .bss : { *(.bss .bss.*) *(COMMON) }
  }
`;

withUtf8(mod, script, (ptr, size) =>
  mod._rvclang_set_linker_script(ptr, size)
);
```

Очистить script:

```js
mod._rvclang_clear_linker_script();
```

## `#include` и флаги

Системных заголовков и libc в POC нет. Свои заголовки добавляются в виртуальную
папку проекта. После этого работает `#include "config.h"`.

```js
function addHeader(mod, path, contents) {
  return withUtf8(mod, path, (pathPtr, pathSize) =>
    withUtf8(mod, contents, (contentsPtr, contentsSize) =>
      mod._rvclang_add_header(pathPtr, pathSize, contentsPtr, contentsSize)
    )
  );
}

mod._rvclang_clear_headers();
addHeader(mod, 'config.h', '#define UART_BASE 0x10000000\\n');
```

Дополнительные `cc1`-флаги:

```js
mod._rvclang_clear_args();
withUtf8(mod, '-O2', (ptr, size) => mod._rvclang_add_arg(ptr, size));
```

Цель, ABI, язык и формат результата зафиксированы POC-обёрткой: переданные
флаги не могут переключить RV32/RV64 или отменить `-emit-obj`.

## Диагностика

После ошибки компиляции или линковки:

```js
const text = mod.UTF8ToString(mod._rvclang_diagnostics());
console.error(text);
```

## Важные ограничения POC

- C и `.S` доступны в JS API. `.S` проходит через C preprocessor; чистый `.s`
  без preprocessor пока не добавлен отдельно.
- Нет libc, sysroot и системных include.
- `lld` под Emscripten стабильно делает **одну линковку на один WASM instance**.
  Для следующей независимой сборки создай новый `await createRvClang()`.
- Один вызов `rvclang_link_objects()` может принять много `.o`; ограничение
  относится к повторному вызову линкера, а не к числу файлов.
- Результат `compile` и `link` нужно забирать через `HEAPU8.slice`, иначе
  указатель указывает на изменяемую память WASM.
