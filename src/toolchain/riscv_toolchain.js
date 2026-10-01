import createRvClang from "./rvclang/rvclang-wasm.mjs"
import rvclangWasmUrl from './rvclang/rvclang-wasm.wasm?url'
import loadBinutils from "@binutils-wasm/binutils"

const encoder = new TextEncoder()

function withUtf8(mod, text, callback) {
    const bytes = encoder.encode(text)
    const ptr = mod._malloc(bytes.length)

    try {
        mod.HEAPU8.set(bytes, ptr)

        return callback(ptr, bytes.length)
    } finally {
        mod._free(ptr)
    }
}

function withBytes(mod, bytes, callback) {
    const ptr = mod._malloc(bytes.length)

    try {
        mod.HEAPU8.set(bytes, ptr)

        return callback(ptr, bytes.length)
    } finally {
        mod._free(ptr)
    }
}

class RiscvToolchain {
    constructor(mod) {
        this.mod = mod
    }

    static async create(options) {

        let target = "rv32im"
        let stdout = console.log
        let stderr = console.error

        if (options)
        {
            if (options.target)
                target = options.target

            if (options.stdout)
                stdout = options.stdout

            if (options.stderr)
                stderr = options.stderr
        }

        let mod = await createRvClang({
            locateFile: (name) => {
                if (name.endsWith(".wasm")) {
                    return rvclangWasmUrl
                }

                return name
            },
            print: stdout,
            printErr: stderr
        })

        let toolchain = new RiscvToolchain(mod)

        toolchain.setTarget(target)

        return toolchain
    }

    setTarget(target) {
        let mod = this.mod

        if (target == "rv32im")
            mod._rvclang_set_target(0)
        else if (target == "rv64gc")
            mod._rvclang_set_target(1)
        else
            throw new Error("Invalid target! passed " + target)
    }

    compile(source) {
        let mod = this.mod

        const status = withUtf8(mod, source, (ptr, size) => mod._rvclang_compile(ptr, size))

        if (status !== 0) {
            throw new Error(mod.UTF8ToString(mod._rvclang_diagnostics()))
        }

        const ptr = mod._rvclang_object_data()
        const size = mod._rvclang_object_size()

        return mod.HEAPU8.slice(ptr, ptr + size)
    }

    compileFile(filename, source) {
        let mod = this.mod

        const status = withUtf8(mod, source, (source_ptr, source_size) => withUtf8(mod, filename, (file_ptr, file_size) => mod._rvclang_compile_file(file_ptr, file_size, source_ptr, source_size)))

        if (status !== 0) {
            throw new Error(mod.UTF8ToString(mod._rvclang_diagnostics()))
        }

        const ptr = mod._rvclang_object_data()
        const size = mod._rvclang_object_size()

        return mod.HEAPU8.slice(ptr, ptr + size)
    }

    compileAssemblyFile(filename, source) {
        let mod = this.mod

        const status = withUtf8(mod, source, (source_ptr, source_size) =>
            withUtf8(mod, filename, (file_ptr, file_size) =>
                mod._rvclang_compile_asm_file(file_ptr, file_size, source_ptr, source_size)
            )
        )

        if (status !== 0) {
            throw new Error(mod.UTF8ToString(mod._rvclang_diagnostics()))
        }

        const ptr = mod._rvclang_object_data()
        const size = mod._rvclang_object_size()

        return mod.HEAPU8.slice(ptr, ptr + size)
    }

    addObject(name, object) {
        let mod = this.mod

        const status = withUtf8(mod, name, (name_ptr, name_size) =>
            withBytes(mod, object, (object_ptr, object_size) =>
                mod._rvclang_add_link_object(name_ptr, name_size, object_ptr, object_size)
            )
        )

        if (status !== 0) {
            throw new Error(`Cannot add object to linker: ${name}`)
        }
    }

    setEntry(name) {
        let mod = this.mod

        withUtf8(mod, name, (name_ptr, name_size) => mod._rvclang_set_entry(name_ptr, name_size))
    }

    setLinkerScript(script) {
        const mod = this.mod
    
        return withUtf8(mod, script, (ptr, size) =>
            mod._rvclang_set_linker_script(ptr, size)
        )
    }

    link() {
        let mod = this.mod

        const status = mod._rvclang_link_objects()

        if (status != 0) {
            throw new Error(mod.UTF8ToString(mod._rvclang_diagnostics()))
        }

        const ptr = mod._rvclang_executable_data()
        const size = mod._rvclang_executable_size()

        return mod.HEAPU8.slice(ptr, ptr + size)
    }

    addHeader(path, content) {
        let mod = this.mod

        return withUtf8(mod, path, (path_ptr, path_size) =>
            withUtf8(mod, content, (content_ptr, content_size) =>
                mod._rvclang_add_header(path_ptr, path_size, content_ptr, content_size)
            )
        )
    }

    clearHeaders() {
        let mod = this.mod

        mod._rvclang_clear_headers()
    }

    clearArgs() {
        let mod = this.mod

        mod._rvclang_clear_args()
    }

    addArg(arg) {
        let mod = this.mod

        withUtf8(mod, arg, (ptr, size) => mod._rvclang_add_arg(ptr, size))
    }
}

async function runBinutil(exe, args, preRun) {
    const createBinutils = await loadBinutils(exe)

    let stderr = ""
    let stdout = ""

    let binutils = await createBinutils({
        print: (str) => stdout += str + "\n",
        printErr: (str) => stderr += str + "\n",
        arguments: args,
        preRun
    })

    return {stdout, stderr}
}

export {
    RiscvToolchain,
    runBinutil
}

// let test_code = `
// #include "helper.h"

// char buffer[256];

// int main()
// {
//     int a = MMIO_TEST;

//     buffer[0] = 123;
//     buffer[2] = 245;
    
//     fail

//     return a + buffer[0] + buffer[2];
// }
// `

// async function main() {
//     const toolchain = await RiscvToolchain.create()
    
//     toolchain.addHeader("helper.h", "#define MMIO_TEST 123")

//     let object = toolchain.compile(test_code)
    
//     toolchain.addObject("test.o", object)

//     toolchain.setLinkerScript(`
// ENTRY(main)

// SECTIONS
// {
//     . = 0x80200000;

//     .text : { *(.text*) }
//     .rodata : { *(.rodata*) }
//     .data : { *(.data*) }
//     .bss : { *(.bss*) *(COMMON) }
// }
// `)

//     let exe = toolchain.link()

//     let readelf_output = await runBinutil("readelf", ["-l", "input.o"], [(mod) => mod.FS.writeFile("input.o", exe)])

//     console.log(readelf_output)
//     console.log(readelf_output.stderr)
//     console.log(readelf_output.stdout)

//     let objdump_output = await runBinutil("objdump", ["-d", "input.o"], [(mod) => mod.FS.writeFile("input.o", exe)])

//     console.log(objdump_output)
//     console.log(objdump_output.stderr)
//     console.log(objdump_output.stdout)

//     // const createBinutils = await loadBinutils("objdump")

//     // let stderr = ""
//     // let stdout = ""

//     // let binutils = await createBinutils({
//     //     // print: console.log,
//     //     // printErr: console.error,
//     //     print: (str) => {
//     //         stdout += str + "\n"
//     //     },
//     //     printErr: (str) => {
//     //         stderr += str + "\n"
//     //     },
//     //     arguments: ["-d", "input.o"],

//     //     preRun: [
//     //         (mod) => {
//     //             mod.FS.writeFile("input.o", object)
//     //         }
//     //     ]
//     // })

//     // if (stderr.length > 0)
//     //     console.error(stderr)
//     // if (stdout.length > 0)
//     //     console.log(stdout)
// }

// main()
