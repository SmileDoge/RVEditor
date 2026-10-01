import "../src/polyfills.js";
import * as monaco from "monaco-editor";

monaco.languages.register({
    id: "riscv-asm"
});

monaco.languages.setMonarchTokensProvider("riscv-asm", {
    keywords: [
        "add", "sub", "addi",
        "and", "or", "xor",
        "sll", "srl", "sra",

        "lb", "lh", "lw",
        "lbu", "lhu",
        "sb", "sh", "sw",

        "beq", "bne", "blt", "bge",
        "bltu", "bgeu",

        "jal", "jalr",
        "lui", "auipc",

        "mul", "mulh", "mulhsu", "mulhu",
        "div", "divu", "rem", "remu",

        "ecall", "ebreak"
    ],

    registers: [
        "zero", "ra", "sp", "gp", "tp",

        "t0", "t1", "t2",
        "s0", "fp", "s1",

        "a0", "a1", "a2", "a3",
        "a4", "a5", "a6", "a7",

        "s2", "s3", "s4", "s5",
        "s6", "s7", "s8", "s9",
        "s10", "s11",

        "t3", "t4", "t5", "t6"
    ],

    directives: [
        ".if",
        ".ifdef",
        ".ifndef",
        ".elseif",
        ".else",
        ".endif",
        ".set",
        ".equ"
    ],

    tokenizer: {
        root: [
            // label:
            [
                /[a-zA-Z_.$][\w.$]*(?=:)/,
                "type.identifier"
            ],

            // directives
            [
                /\.[a-zA-Z_][\w.]*/,
                "keyword.directive"
            ],

            // identifiers / instructions / registers
            [
                /[a-zA-Z_.$][\w.$]*/,
                {
                    cases: {
                        "@keywords": "keyword",
                        "@registers": "variable.predefined",
                        "@default": "identifier"
                    }
                }
            ],

            // hex
            [
                /0x[0-9a-fA-F]+/,
                "number.hex"
            ],

            // binary
            [
                /0b[01]+/,
                "number.binary"
            ],

            // decimal
            [
                /-?\d+/,
                "number"
            ],

            // strings
            [
                /"([^"\\]|\\.)*"/,
                "string"
            ],

            // comments
            [
                /#.*/,
                "comment"
            ],

            [
                /\/\/.*/,
                "comment"
            ],

            // punctuation
            [
                /[(),]/,
                "delimiter"
            ],

            [
                /\.[A-Za-z_][\w.]*/,
                {
                    cases: {
                        "@directives": "keyword.directive",
                        "@default": "keyword"
                    }
                }
            ]
        ]
    }
});

let code = ``

const editor = monaco.editor.create(
    document.getElementById("editor"),
    {
        value: code,
        language: "riscv-asm",
        theme: "vs-dark",
        automaticLayout: true,
        minimap: {
            enabled: true
        },
        fontSize: 24,
        tabSize: 4,
        insertSpaces: true,
        scrollBeyondLastLine: false
    }
);

function getFileURI(project, name) {
    return monaco.Uri.parse(`gmod://${project}/${name}`)
}

const files = new Map()

let currentFile = null

function switchFile(id) {
    const file = files.get(id)

    if (!file) {
        console.error(
            "RVEditor.switchFile: model not found:",
            id
        )

        return
    }

    if (currentFile === id)
        return

    if (currentFile !== null) {
        const oldFile = files.get(currentFile)

        if (oldFile) {
            oldFile.viewState =
                editor.saveViewState()
        }
    }

    editor.setModel(file.model)

    if (file.viewState) {
        editor.restoreViewState(
            file.viewState
        )
    }

    currentFile = id

    editor.focus()
}

function openFile(id, code, language) {
    let file = files.get(id)

    if (!file) {
        const uri = monaco.Uri.parse(
            "riscv:///" + encodeURIComponent(id)
        )

        const model = monaco.editor.createModel(
            code,
            language,
            uri
        )

        file = {
            model,
            viewState: null,
            dirty: false,
            ignoreChanges: false,
            savedVersionId: model.getAlternativeVersionId()
        }

        model.onDidChangeContent(() => {
            if (file.ignoreChanges)
                return

            const dirty = model.getAlternativeVersionId() != file.savedVersionId

            if (dirty != file.dirty) {
                file.dirty = dirty

                gmod.fileDirtyChanged(id, dirty)
            }
        })

        files.set(id, file)
    }

    return file
}

function closeFile(id) {
    const file = files.get(id);

    if (!file)
        return;

    if (currentFile === id) {
        editor.setModel(null);
        currentFile = null;
    }

    file.model.dispose();

    files.delete(id);
}

function setFileLanguage(id, language) {
    const file = files.get(id);

    if (!file)
        return;

    if (file.model.getLanguageId() === language)
        return;

    monaco.editor.setModelLanguage(
        file.model,
        language
    );
}

function markSaved(id) {
    const file = files.get(id)
    if (!file) return

    file.savedVersionId = file.model.getAlternativeVersionId()
    file.dirty = false

    gmod.fileDirtyChanged(id, false)
}

window.RVEditor = {
    openFile,
    switchFile,
    setFileLanguage,
    closeFile,
    markSaved,

    getCurrentFile() {
        return current_file
    },
    
    getCode() {
        return editor.getValue();
    },

    getTabCode(id) {
        const file = files.get(id);

        if (!file)
            return;

        return file.model.getValue()
    },

    setCode(code) {
        editor.setValue(code);
    },

    setLanguage(language) {
        monaco.editor.setModelLanguage(
            editor.getModel(),
            language
        );
    },

    getLanguage() {
       return editor.getModel().getLanguageId()
    },

    setErrors(errors) {
        monaco.editor.setModelMarkers(
            editor.getModel(),
            "rvcompiler",
            errors.map(err => ({
                startLineNumber: err.line,
                startColumn: err.column ?? 1,

                endLineNumber: err.line,
                endColumn: err.endColumn ?? ((err.column ?? 1) + 1),

                message: err.message,
                severity:
                    err.severity === "warning"
                        ? monaco.MarkerSeverity.Warning
                        : monaco.MarkerSeverity.Error
            }))
        );
    },

    clearErrors() {
        monaco.editor.setModelMarkers(
            editor.getModel(),
            "rvcompiler",
            []
        );
    },

    focus() {
        editor.focus();
    },

    setFontSize(size) {
        editor.updateOptions({
            fontSize: size
        })
    }
};

import loadGas from "@binutils-wasm/gas"

function parseGasDiagnostics(lines) {
    const result = [];

    for (const line of lines) {
        const match = line.match(
            /^(.+?):(\d+):\s*(Error|Warning):\s*(.*)$/i
        );

        if (!match) {
            continue;
        }

        result.push({
            file: match[1],
            line: Number(match[2]),
            column: 1,
            severity:
                match[3].toLowerCase() === "warning"
                    ? "warning"
                    : "error",
            message: match[4]
        });
    }

    return result;
}

async function assemble(source) {
    const createGas = await loadGas("riscv64-linux-gnu");

    const stderr = [];
    const stdout = [];

    try {
        const gas = await createGas({
            arguments: [
                "-march=rv64gc",
                "-mabi=lp64d",
                "-o",
                "/output.o",
                "/input.s"
            ],

            noExitRuntime: true,

            print(str) {
                stdout.push(str);
                console.log("[gas]", str);
            },

            printErr(str) { 1
                stderr.push(str);
                console.error("[gas]", str);
            },

            preRun: [
                (module) => {
                    module.FS.writeFile(
                        "/input.s",
                        source
                    );
                }
            ]
        });

        const diagnostics = parseGasDiagnostics(stderr);

        const hasErrors = diagnostics.some(d => d.severity === "error");

        if (hasErrors) {
            return {
                ok: false,
                diagnostics,
                stdout,
                stderr
            };
        }

        const objectFile = gas.FS.readFile("/output.o");

        return {
            ok: true,
            objectFile,
            diagnostics,
            stdout,
            stderr
        }
    } catch (err) {
        return {
            ok: false,
            diagnostics: [
                {
                    line: 1,
                    column: 1,
                    severity: "error",
                    message: err instanceof Error ? err.message : String(err)
                }
            ],
            stdout,
            stderr
        }
    }
}

async function build() {
    let language = RVEditor.getLanguage()

    if (language != "riscv-asm") {
        RVEditor.clearErrors();
        return
    }

    const result = await assemble(editor.getValue());

    RVEditor.clearErrors();

    if (!result.ok) {
        let errors = []

        result.diagnostics.forEach(d => {
            const model = editor.getModel();
            if (!model) return;
        
            const contentLine = model.getLineContent(d.line);

            const firstNonWhitespace = contentLine.search(/\S/);

            if (firstNonWhitespace === -1) {
                return;
            }
        
            const trimmedRight = contentLine.trimEnd();
        
            errors.push({
                line: d.line,
        
                // Monaco columns are 1-based
                column: firstNonWhitespace + 1,
        
                endColumn: trimmedRight.length + 1,
        
                message: d.message,
                severity: d.severity
            });
        });

        RVEditor.setErrors(errors);

        return;
    }
}

editor.getDomNode().addEventListener("wheel", (event) => {
    if (event.ctrlKey) {
        event.preventDefault();

        const currentFontSize = editor.getOption(monaco.editor.EditorOption.fontSize);
        const newFontSize = Math.max(8, currentFontSize - Math.sign(event.deltaY) * 2);

        editor.updateOptions({
            fontSize: newFontSize
        });
    }
})

// editor.getDomNode().addEventListener("keydown", (event) => {
//     console.log(event.ctrlKey, String.fromCharCode(event.keyCode))

//     if (event.ctrlKey && event.keyCode == "B".charCodeAt(0)) {
//         build()
//     }

//     if (event.ctrlKey && event.keyCode == "N".charCodeAt(0)) {
//         gmod.newFile()
//     }

//     if (event.ctrlKey && event.keyCode == "S".charCodeAt(0)) {
//         gmod.saveFile()
//     }
// })

window.addEventListener("keydown", (event) => {
    if (event.ctrlKey && event.keyCode == "B".charCodeAt(0)) {
        build()
    }

    if (event.ctrlKey && event.keyCode == "N".charCodeAt(0)) {
        gmod.newFile()
    }

    if (event.ctrlKey && event.keyCode == "S".charCodeAt(0)) {
        gmod.saveFile()
    }
})

let validateTimer = null;

editor.onDidChangeModelContent(() => {
    clearTimeout(validateTimer);

    validateTimer = setTimeout(async () => {
        await build();
    }, 500);
});
