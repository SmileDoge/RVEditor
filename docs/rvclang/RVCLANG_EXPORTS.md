# `rvclang-wasm`: справочник экспортов `_rvclang_*`

Это низкоуровневый C API модуля. В JavaScript функции доступны как свойства
`mod._rvclang_*`. Все текстовые и бинарные аргументы передаются как пара
`(ptr, size)`: `ptr` указывает на начало данных в `mod.HEAPU8`, а `size` —
количество байт. Строки **не обязаны** завершаться `\0`.

Для записи данных в память применяются экспортированные Emscripten-функции
`mod._malloc(size)` и `mod._free(ptr)`. Результаты `.o` и ELF всегда нужно
забирать через `mod.HEAPU8.slice(ptr, ptr + size)`: следующий вызов компиляции
или линковки заменяет внутренний буфер.

## Статусы и диагностика

Почти все изменяющие состояние функции возвращают `0` при успехе и ненулевое
значение при ошибке. После ошибки текста надо читать:

```js
const text = mod.UTF8ToString(mod._rvclang_diagnostics());
```

Тот же текст Clang/LLD отправляет в callback `printErr`, переданный при
`await createRvClang({ printErr })`.

## Цель

| Экспорт | Сигнатура | Описание |
| --- | --- | --- |
| `_rvclang_set_target` | `(target) -> int` | Выбирает целевую платформу до компиляции и линковки. `0`: `riscv32-unknown-elf`, `rv32im`, `ilp32`; `1`: `riscv64-unknown-elf`, `rv64gc`, `lp64d`. Иное значение возвращает `1`. |

## Компиляция

| Экспорт | Сигнатура | Описание |
| --- | --- | --- |
| `_rvclang_compile` | `(sourcePtr, sourceSize) -> int` | Компилирует C в relocatable RISC-V ELF `.o`. Имя исходника в diagnostics — `input.c`. |
| `_rvclang_compile_file` | `(namePtr, nameSize, sourcePtr, sourceSize) -> int` | То же, но с именем исходника, например `src/main.c`. Ошибки содержат `src/main.c:строка:столбец`. Имя не должно быть абсолютным и не может содержать `..`, `\\` или `:`. |
| `_rvclang_compile_asm_file` | `(namePtr, nameSize, sourcePtr, sourceSize) -> int` | Компилирует ассемблер через C preprocessor, то есть функционально `.S`: работают `#define` и `#include`. Расширение имени не проверяется, поэтому GMod-имя `start.s` допустимо и тоже будет обработано как `.S`. |
| `_rvclang_object_data` | `() -> ptr` | Указатель на последний успешно созданный `.o`; `0`, если буфера нет. |
| `_rvclang_object_size` | `() -> size` | Размер последнего `.o` в байтах. |

Успех компиляции выводится через `print` в виде `rvclang: compiled object N bytes`
или `rvclang: assembled object N bytes`.

## Виртуальные headers

Headers существуют только в памяти одного WASM instance. При компиляции каждый
добавленный файл виден по пути `/project/<path>`.

| Экспорт | Сигнатура | Описание |
| --- | --- | --- |
| `_rvclang_add_header` | `(pathPtr, pathSize, contentsPtr, contentsSize) -> int` | Добавляет virtual header. Например `include/riscv.h`; затем передай `-I/project/include` и используй `#include "riscv.h"`. Путь должен быть относительным, без `..`, `\\` и `:`. |
| `_rvclang_clear_headers` | `() -> void` | Удаляет все виртуальные headers. |

## Дополнительные флаги Clang

| Экспорт | Сигнатура | Описание |
| --- | --- | --- |
| `_rvclang_add_arg` | `(argPtr, argSize) -> int` | Добавляет один аргумент именно `clang -cc1`, например `-O2`, `-I/project/include` или `-debug-info-kind=standalone`. Вызывается много раз; порядок сохраняется. Не передавай driver-флаги наподобие `-g` или `-march=...`. |
| `_rvclang_clear_args` | `() -> void` | Очищает пользовательские cc1-аргументы. |

Обёртка фиксирует triple, CPU, ABI, язык и `-emit-obj` после добавленных
аргументов: пользователь не может подменить выбранную RV32/RV64-цель.

## Набор объектов для линковки

| Экспорт | Сигнатура | Описание |
| --- | --- | --- |
| `_rvclang_clear_link_objects` | `() -> void` | Очищает список входных `.o`. Вызывай перед каждой новой линковкой. |
| `_rvclang_add_link_object` | `(namePtr, nameSize, dataPtr, dataSize) -> int` | Копирует объект из WASM-памяти в набор линкера. `name` обязан быть простым именем вроде `main.o`: без `/`, `\\`, `:` и NUL. Проверяй возвращённый статус. |
| `_rvclang_link_objects` | `() -> int` | Линкует весь накопленный набор `.o` в RISC-V `ET_EXEC` ELF. |
| `_rvclang_link_current` | `() -> int` | Линкует только последний объект, возвращённый компиляцией. Удобно для одного файла. |

## Linker script и точка входа

| Экспорт | Сигнатура | Описание |
| --- | --- | --- |
| `_rvclang_set_linker_script` | `(scriptPtr, scriptSize) -> int` | Устанавливает linker script, эквивалентный `ld.lld -T script.ld`. Нужен для bare-metal адресов RAM/Flash и layout секций. |
| `_rvclang_clear_linker_script` | `() -> void` | Отключает ранее установленный script. |
| `_rvclang_set_entry` | `(namePtr, nameSize) -> int` | Меняет ELF entry symbol. По умолчанию `main`; для bare metal обычно `_start`. Имя — простой symbol без `/`, `\\`, `:` и NUL. |
| `_rvclang_executable_data` | `() -> ptr` | Указатель на последний готовый `ET_EXEC` ELF. |
| `_rvclang_executable_size` | `() -> size` | Размер последнего ELF в байтах. |

Внутри вызывается LLD примерно так:

```text
ld.lld -m elf32lriscv -e <entry> [-T script.ld] -o output.elf input.o ...
```

Для RV64 используется `-m elf64lriscv`. Текущий экспорт возвращает только ELF;
flat binary (`--oformat=binary`) ещё не оформлен отдельным API.

## Диагностика

| Экспорт | Сигнатура | Описание |
| --- | --- | --- |
| `_rvclang_diagnostics` | `() -> ptr` | Указатель на NUL-terminated UTF-8 текст последних warnings/errors Clang или LLD. Читать через `mod.UTF8ToString(ptr)`. Строка изменяется при следующей операции. |

## Минимальный поток

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

`compileFile`, `compileAsmFile`, `addObject` и `setText` в этом примере —
короткие JS-обёртки с `malloc`/копированием/`free`; готовые варианты есть в
[`API.md`](API.md).

## Ограничения текущего POC

- Нет libc, sysroot и системных include.
- `printf` не реализован: UART требует собственного bare-metal кода.
- `.bss` не хранится в ELF file bytes как данные; при необходимости startup
  должен её обнулить.
- После успешного `lld` текущий WASM instance надёжно не поддерживает вторую
  независимую линковку. На следующую сборку создавай новый instance.
