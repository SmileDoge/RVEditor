import createRvClang from "../src/toolchain/rvclang/rvclang-wasm.mjs";

function bytesToBase64(bytes) {
    let binary = ""
    const chunkSize = 0x8000

    for (let i = 0; i < bytes.length; i += chunkSize) {
        binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize))
    }

    return btoa(binary)
}

async function main() {
    const mod = await createRvClang({
        locateFile: (name) => new URL(name, import.meta.url).href,
        print: console.log,
        printErr: console.error
    });
    
    const source = new TextEncoder().encode(
        "int add(int a, int b) { return a + b; }\n"
    );
    
    const sourcePtr = mod._malloc(source.length);
    mod.HEAPU8.set(source, sourcePtr);
    
    const status = mod._rvclang_compile(sourcePtr, source.length);
    mod._free(sourcePtr);
    
    if (status !== 0) {
        throw new Error(mod.UTF8ToString(mod._rvclang_diagnostics()));
    }
    
    const ptr = mod._rvclang_object_data();
    const len = mod._rvclang_object_size();
    const elfObject = mod.HEAPU8.slice(ptr, ptr + len);
    
    console.log("RV32 ELF object:", elfObject.length, elfObject);
    console.log(
        "class =", elfObject[4],              // 1 = ELFCLASS32
        "type =", elfObject[16] | elfObject[17] << 8,  // 1 = ET_REL
        "machine =", elfObject[18] | elfObject[19] << 8 // 243 = EM_RISCV
    );

    if (gmod.receiveObject) {
        const b64 = bytesToBase64(elfObject)
        gmod.receiveObject(b64)
    }

    
}

main()
