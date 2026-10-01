import "../polyfills.js";
import * as monaco from "monaco-editor";
import loadGas from "@binutils-wasm/gas";
import { HostBridge } from "../app/bridge/host_bridge.js";
import { EditorApp } from "../app/editor_app.js";
import { LayoutManager } from "../app/ui/layout_manager.js";
import { DocumentStore } from "../app/state/document_store.js";
import { WorkspaceStateStore } from "../app/state/workspace_state_store.js";
import { ContextMenu } from "../app/ui/context_menu.js";
import { BuildLogView } from "../app/ui/build_log_view.js";
import { DialogService } from "../app/ui/dialog_service.js";
import { EditorChromeView } from "../app/ui/editor_chrome_view.js";
import { ProjectTreeView } from "../app/ui/project_tree_view.js";
import { TabsView } from "../app/ui/tabs_view.js";
import { TooltipService } from "../app/ui/tooltip_service.js";

monaco.languages.register({ id: "riscv-asm" });
monaco.languages.setMonarchTokensProvider("riscv-asm", {
    keywords: [
        "add", "sub", "addi", "addiw", "subw", "addw", "and", "or", "xor", "andi", "ori", "xori",
        "sll", "srl", "sra", "slli", "srli", "srai", "lb", "lh", "lw", "ld", "lbu", "lhu", "lwu",
        "sb", "sh", "sw", "sd", "beq", "bne", "blt", "bge", "bltu", "bgeu", "jal", "jalr", "lui",
        "auipc", "mul", "mulh", "mulhsu", "mulhu", "div", "divu", "rem", "remu", "ecall", "ebreak",
        "fence", "fence.i", "li", "la", "lla", "mv", "nop", "not", "neg", "ret", "j", "jr", "call", "tail"
    ],
    registers: [
        "zero", "ra", "sp", "gp", "tp", "fp", "t0", "t1", "t2", "t3", "t4", "t5", "t6",
        "s0", "s1", "s2", "s3", "s4", "s5", "s6", "s7", "s8", "s9", "s10", "s11",
        "a0", "a1", "a2", "a3", "a4", "a5", "a6", "a7",
        "x0", "x1", "x2", "x3", "x4", "x5", "x6", "x7", "x8", "x9", "x10", "x11", "x12", "x13",
        "x14", "x15", "x16", "x17", "x18", "x19", "x20", "x21", "x22", "x23", "x24", "x25", "x26",
        "x27", "x28", "x29", "x30", "x31"
    ],
    tokenizer: {
        root: [
            [/[a-zA-Z_.$][\w.$]*(?=:)/, "type.identifier"],
            [/\.[a-zA-Z_][\w.]*/, "keyword.directive"],
            [/[a-zA-Z_.$][\w.$]*/, {
                cases: { "@keywords": "keyword", "@registers": "variable.predefined", "@default": "identifier" }
            }],
            [/0x[0-9a-fA-F]+/, "number.hex"],
            [/0b[01]+/, "number.binary"],
            [/-?\d+/, "number"],
            [/"([^"\\]|\\.)*"/, "string"],
            [/#.*/, "comment"],
            [/\/\/.*/, "comment"],
            [/[(),]/, "delimiter"]
        ]
    }
});

const editorElement = document.getElementById("editor");
const editor = monaco.editor.create(editorElement, {
    value: "",
    language: "plaintext",
    theme: "vs-dark",
    automaticLayout: true,
    minimap: { enabled: true },
    fontSize: 18,
    tabSize: 4,
    insertSpaces: true,
    scrollBeyondLastLine: false
});

const treeElement = document.getElementById("project-tree");
const tabsElement = document.getElementById("tabs");
const breadcrumbsElement = document.getElementById("breadcrumbs");
const statusElement = document.getElementById("status-message");
const refreshButton = document.getElementById("refresh-projects");
const newProjectButton = document.getElementById("new-project");
const openSettingsButton = document.getElementById("open-settings");
const settingsView = document.getElementById("settings-view");
const resetWorkspaceButton = document.getElementById("reset-workspace");
const newFileButton = document.getElementById("new-file");
const newDirectoryButton = document.getElementById("new-directory");
const saveFileButton = document.getElementById("save-file");
const buildProjectButton = document.getElementById("build-project");
const buildFileButton = document.getElementById("build-file");
const dialogBackdrop = document.getElementById("dialog-backdrop");
const dialogForm = document.getElementById("dialog");
const dialogTitle = document.getElementById("dialog-title");
const dialogMessage = document.getElementById("dialog-message");
const dialogFields = document.getElementById("dialog-fields");
const dialogCancel = document.getElementById("dialog-cancel");
const dialogSubmit = document.getElementById("dialog-submit");
const contextMenu = document.getElementById("context-menu");
const editorTooltip = document.getElementById("editor-tooltip");
const statusLanguage = document.getElementById("status-language");
const statusPosition = document.getElementById("status-position");
const statusSaveState = document.getElementById("status-save-state");
const statusProject = document.getElementById("status-project");
const buildLog = document.getElementById("build-log");
const buildLogOutput = document.getElementById("build-log-output");
const toggleBuildLogButton = document.getElementById("toggle-build-log");
const collapseBuildLogButton = document.getElementById("collapse-build-log");
const clearBuildLogButton = document.getElementById("clear-build-log");
const sidebar = document.getElementById("sidebar");
const sidebarResizer = document.getElementById("sidebar-resizer");
const buildLogResizer = document.getElementById("build-log-resizer");
const workspace = document.getElementById("workspace");

const files = new Map();
const projects = new Map();
const openingFiles = new Map();
const collapsedProjects = {};
const collapsedDirectories = {};

let activeFileId = null;
let selectedProjectId = null;
let activeProjectId = null;
let gasFactoryPromise = null;
let sidebarWidth = 240;
let buildLogHeight = 180;
let settingsOpen = false;
const hostBridge = new HostBridge();
const tooltipService = new TooltipService(editorTooltip);
tooltipService.bind();
const layoutManager = new LayoutManager({
    sidebar,
    sidebarResizer,
    buildLog,
    buildLogResizer,
    workspace,
    onResize: () => editor.layout(),
    onChange: () => scheduleWorkspaceStateSave()
});
const projectTreeView = new ProjectTreeView({
    element: treeElement,
    projects,
    collapsedProjects,
    collapsedDirectories,
    fileId,
    directoryId,
    getFileIconType,
    createDisclosureIcon,
    clearElement,
    getSelectedProjectId: () => selectedProjectId,
    setSelectedProjectId: (projectId) => { selectedProjectId = projectId; },
    getActiveFileId: () => activeFileId,
    openFile,
    updateActionState,
    scheduleWorkspaceStateSave,
    showProjectContextMenu,
    showDirectoryContextMenu,
    showFileContextMenu
});

const tabsView = new TabsView({
    element: tabsElement,
    files,
    clearElement,
    getActiveFileId: () => activeFileId,
    isSettingsOpen: () => settingsOpen,
    activateFile,
    closeFile,
    closeSettings
});

const editorChromeView = new EditorChromeView({
    editor,
    projects,
    breadcrumbsElement,
    statusLanguage,
    statusPosition,
    statusSaveState,
    statusProject,
    clearElement,
    formatLanguage,
    getActiveFile
});

const dialogService = new DialogService({
    form: dialogForm,
    backdrop: dialogBackdrop,
    titleElement: dialogTitle,
    messageElement: dialogMessage,
    fieldsElement: dialogFields,
    cancelButton: dialogCancel,
    submitButton: dialogSubmit,
    clearElement,
    setHostDialogOpen
});
dialogService.bind();

const contextMenuService = new ContextMenu({ element: contextMenu, clearElement });
contextMenuService.bind();

const buildLogView = new BuildLogView({
    element: buildLog,
    output: buildLogOutput,
    resizer: buildLogResizer,
    toggleButton: collapseBuildLogButton,
    getHeight: () => buildLogHeight
});

const workspaceStateStore = new WorkspaceStateStore({
    files,
    projects,
    collapsedProjects,
    collapsedDirectories,
    fileId,
    directoryId,
    request: hostRequest,
    getActiveFile,
    getActiveProjectId: () => activeProjectId,
    setActiveProjectId: (projectId) => { activeProjectId = projectId; },
    getSidebarWidth: () => sidebarWidth,
    getBuildLogHeight: () => buildLogHeight,
    setSidebarWidth,
    setBuildLogHeight,
    renderProjectTree,
    openFile,
    activateFile,
    updateActionState,
    setStatus
});

function setSidebarWidth(width) {
    layoutManager.setSidebarWidth(width);
    sidebarWidth = layoutManager.sidebarWidth;
}

function setBuildLogHeight(height) {
    layoutManager.setBuildLogHeight(height);
    buildLogHeight = layoutManager.buildLogHeight;
}

function fileId(project, path) {
    return `${project}\u0000${path}`;
}

function directoryId(project, path) {
    return `${project}\u0000${path}`;
}

function parentDirectory(path) {
    const slash = path.lastIndexOf("/");
    return slash < 0 ? "" : path.slice(0, slash);
}

function createDisclosureIcon(isCollapsed) {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.classList.add("tree-disclosure-icon");
    svg.setAttribute("viewBox", "0 0 20 20");
    svg.setAttribute("aria-hidden", "true");

    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", isCollapsed ? "M7 4 L15 10 L7 16 Z" : "M4 7 L16 7 L10 15 Z");
    svg.appendChild(path);
    return svg;
}

function setStatus(message, isError = false) {
    statusElement.textContent = message;
    statusElement.style.color = isError ? "#f48771" : "#9cdcfe";
}

function scheduleWorkspaceStateSave() {
    workspaceStateStore.scheduleSave();
}

function setActiveProject(projectId) {
    if (!projects.has(projectId)) return false;
    activeProjectId = projectId;
    scheduleWorkspaceStateSave();
    return true;
}

function renameCollapsedProjectState(oldProjectId, newProjectId) {
    workspaceStateStore.renameProject(oldProjectId, newProjectId);
}

function renameCollapsedDirectoryState(projectId, oldPath, newPath) {
    workspaceStateStore.renameDirectory(projectId, oldPath, newPath);
}

function removeCollapsedDirectoryState(projectId, path) {
    workspaceStateStore.removeDirectory(projectId, path);
}

async function restoreWorkspaceState() {
    return workspaceStateStore.restore();
}

function clearElement(element) {
    while (element.firstChild) {
        element.removeChild(element.firstChild);
    }
}

function setHostDialogOpen(isOpen) {
    if (!window.gmod || typeof window.gmod.setDialogOpen !== "function") return;
    try {
        window.gmod.setDialogOpen(isOpen === true);
    } catch (error) {
        // The browser preview has no Lua pause-menu hook to notify.
    }
}

function showDialog(options) {
    return dialogService.show(options);
}

function hideContextMenu() {
    contextMenuService.hide();
}

function showContextMenu(event, actions) {
    contextMenuService.show(event, actions);
}

function hostRequest(operation, payload = {}) {
    return hostBridge.request(operation, payload);
}

function normalizeBinaryData(data) {
    if (data instanceof Uint8Array) return data;
    if (data instanceof ArrayBuffer) return new Uint8Array(data);
    if (ArrayBuffer.isView(data)) return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
    if (Array.isArray(data)) return new Uint8Array(data);
    throw new TypeError("Binary data must be a Uint8Array, ArrayBuffer, typed-array view, or byte array.");
}

function bytesToBase64(bytes) {
    const chunkSize = 0x8000;
    const chunks = [];
    for (let offset = 0; offset < bytes.length; offset += chunkSize) {
        const chunk = bytes.subarray(offset, Math.min(offset + chunkSize, bytes.length));
        chunks.push(String.fromCharCode.apply(null, chunk));
    }
    return btoa(chunks.join(""));
}

async function writeBinaryFile(project, path, data) {
    const bytes = normalizeBinaryData(data);
    return hostRequest("writeBinaryFile", {
        project,
        path,
        content_base64: bytesToBase64(bytes)
    });
}

function getLanguage(path) {
    const extension = path.split(".").pop().toLowerCase();
    if (path === "rvproject" || extension === "json") return "json";
    if (extension === "c" || extension === "h") return "c";
    if (extension === "cpp" || extension === "hpp") return "cpp";
    if (extension === "s" || extension === "asm") return "riscv-asm";
    return "plaintext";
}

function getFileIconType(path) {
    const extension = path.split(".").pop().toLowerCase();
    if (extension === "c" || extension === "h") return "c";
    if (extension === "cpp" || extension === "hpp") return "cpp";
    if (extension === "s" || extension === "asm") return "asm";
    if (extension === "json") return "json";
    return "text";
}

function getCompilerSettings(project) {
    const compiler = project.compiler || {};
    const gas = compiler.gas || {};
    const tinycc = compiler.tinycc || {};

    return {
        gas: {
            target: gas.target || "riscv64-linux-gnu",
            march: gas.march || "rv64gc",
            mabi: gas.mabi || "lp64d",
            extraArgs: gas.extra_args || ""
        },
        tinycc: {
            target: tinycc.target || "",
            extraArgs: tinycc.extra_args || ""
        }
    };
}

function getBuildSettings(project) {
    const build = project.build || {};
    return {
        objectsDir: build.objects_dir || "build",
        outputFile: build.output_file || "build/output.elf"
    };
}

function getActiveFile() {
    return activeFileId ? files.get(activeFileId) : null;
}

function getCurrentProject() {
    // let file = getActiveFile()

    // if (!file) return

    return projects.get(selectedProjectId)
}

function formatLanguage(language) {
    if (language === "riscv-asm") return "ASM";
    if (language === "cpp") return "C++";
    if (language === "c") return "C";
    if (language === "json") return "JSON";
    return "Plain Text";
}

function updateStatusBar() {
    editorChromeView.updateStatus();
}

function renderBreadcrumbs() {
    editorChromeView.renderBreadcrumbs();
}

function setBuildLogOpen(open) {
    buildLogView.setOpen(open);
}

function clearBuildLog() {
    buildLogView.clear();
}

function appendBuildLog(message) {
    buildLogView.append(message);
}

function updateActionState() {
    const file = settingsOpen ? null : getActiveFile();
    saveFileButton.disabled = !file || !file.dirty;
    buildFileButton.disabled = !file || file.language !== "riscv-asm";
    newFileButton.disabled = !selectedProjectId;
    newDirectoryButton.disabled = !selectedProjectId;
    updateStatusBar();
    renderBreadcrumbs();
}

function renderTabs() {
    tabsView.render();
}

function renderProjectTree() {
    return projectTreeView.render();
}

function expandFileParents(projectId, path) {
    return projectTreeView.expandFileParents(projectId, path);
}

function activateFile(id, preserveTreeState = false) {
    const file = files.get(id);
    if (!file || (id === activeFileId && !settingsOpen)) return;

    const previous = getActiveFile();
    if (previous) previous.viewState = editor.saveViewState();

    editor.setModel(file.model);
    if (file.viewState) editor.restoreViewState(file.viewState);

    activeFileId = id;
    settingsOpen = false;
    settingsView.hidden = true;
    editorElement.style.display = "";
    selectedProjectId = file.project;
    if (!preserveTreeState) {
        delete collapsedProjects[file.project];
        expandFileParents(file.project, file.path);
    }
    editor.focus();

    renderTabs();
    renderProjectTree();
    updateActionState();
    setStatus(file.dirty ? "Unsaved changes" : "Saved");
    scheduleWorkspaceStateSave();
}

function openSettings() {
    const activeFile = getActiveFile();
    if (activeFile) activeFile.viewState = editor.saveViewState();

    settingsOpen = true;
    settingsView.hidden = false;
    editorElement.style.display = "none";
    renderTabs();
    updateActionState();
    setStatus("Editor settings");
}

function closeSettings() {
    if (!settingsOpen) return;
    settingsOpen = false;
    settingsView.hidden = true;
    editorElement.style.display = "";
    editor.layout();
    renderTabs();
    updateActionState();
}

async function resetWorkspace() {
    const confirmed = await showDialog({
        title: "Reset editor workspace?",
        message: "This resets window placement, panel sizes, open tabs, and collapsed folders. Projects and source files are not deleted.",
        submitLabel: "Reset workspace",
        danger: true,
        fields: []
    });
    if (!confirmed) return;

    workspaceStateStore.cancelPendingSave();

    try {
        await hostRequest("resetWorkspaceState");
        workspaceStateStore.markNotReady();
        activeProjectId = null;
        setSidebarWidth(240);
        buildLogHeight = 180;
        if (!buildLog.classList.contains("collapsed")) buildLog.style.flexBasis = `${buildLogHeight}px`;
        setStatus("Workspace reset. Reopen the editor to apply the default tabs and window placement.");
    } catch (error) {
        setStatus(error.message, true);
    }
}

const documentStore = new DocumentStore({
    monaco,
    files,
    openingFiles,
    fileId,
    getLanguage,
    request: hostRequest,
    activateFile,
    renderTabs,
    updateActionState,
    setStatus,
    scheduleBuild,
    isActive: (file) => file.id === activeFileId
});

function createFileModel(project, path, source) {
    return documentStore.create(project, path, source);
}

function openFile(project, path) {
    return documentStore.open(project, path);
}

function saveFile(file) {
    return documentStore.save(file);
}

function saveActiveFile() {
    return saveFile(getActiveFile());
}

function removeFileFromWorkspace(id) {
    const file = files.get(id);
    if (!file) return false;

    if (file.validationTimer) clearTimeout(file.validationTimer);

    const wasActive = activeFileId === id;
    const remainingIds = [...files.keys()].filter((remainingId) => remainingId !== id);
    files.delete(id);
    file.model.dispose();

    if (wasActive) {
        activeFileId = null;
        const nextId = remainingIds[0] || null;
        if (nextId) activateFile(nextId);
        else editor.setModel(null);
    }

    renderTabs();
    renderProjectTree();
    updateActionState();
    if (!activeFileId) setStatus("Select a file to begin.");
    scheduleWorkspaceStateSave();

    return true;
}

async function closeFile(id) {
    const file = files.get(id);
    if (!file) return;

    if (file.dirty) {
        const confirmed = await showDialog({
            title: "Discard unsaved changes?",
            message: `Changes in '${file.path}' will be lost.`,
            submitLabel: "Discard",
            danger: true,
            fields: []
        });

        if (!confirmed) return;
    }

    removeFileFromWorkspace(id);
}

function parseGasDiagnostics(lines) {
    const diagnostics = [];
    for (const line of lines) {
        const match = line.match(/^.+?:(\d+):\s*(Error|Warning):\s*(.*)$/i);
        if (!match) continue;
        diagnostics.push({
            line: Number(match[1]),
            severity: match[2].toLowerCase() === "warning" ? "warning" : "error",
            message: match[3]
        });
    }
    return diagnostics;
}

async function getGasFactory() {
    if (!gasFactoryPromise) gasFactoryPromise = loadGas("riscv64-linux-gnu");
    return gasFactoryPromise;
}

async function assemble(source) {
    const createGas = await getGasFactory();
    const stderr = [];

    try {
        await createGas({
            arguments: ["-march=rv64gc", "-mabi=lp64d", "-o", "/output.o", "/input.s"],
            noExitRuntime: true,
            printErr(message) { stderr.push(message); },
            preRun: [(module) => module.FS.writeFile("/input.s", source)]
        });

        const diagnostics = parseGasDiagnostics(stderr);
        return { ok: !diagnostics.some((diagnostic) => diagnostic.severity === "error"), diagnostics };
    } catch (error) {
        return {
            ok: false,
            diagnostics: [{
                line: 1,
                severity: "error",
                message: error instanceof Error ? error.message : String(error)
            }]
        };
    }
}

function markersForDiagnostics(model, diagnostics) {
    const markers = [];

    for (let index = 0; index < diagnostics.length; index += 1) {
        const diagnostic = diagnostics[index];
        if (diagnostic.line < 1 || diagnostic.line > model.getLineCount()) continue;
        const text = model.getLineContent(diagnostic.line);
        const firstNonWhitespace = text.search(/\S/);
        const column = firstNonWhitespace < 0 ? 1 : firstNonWhitespace + 1;

        markers.push({
            startLineNumber: diagnostic.line,
            startColumn: column,
            endLineNumber: diagnostic.line,
            endColumn: Math.max(column + 1, text.trimEnd().length + 1),
            message: diagnostic.message,
            severity: diagnostic.severity === "warning" ? monaco.MarkerSeverity.Warning : monaco.MarkerSeverity.Error
        });
    }

    return markers;
}

import { RiscvToolchain, runBinutil } from "../toolchain/riscv_toolchain.js";

async function buildProject(project) {
    if (!project) return

    const projectId = project.id
    setStatus(`Refreshing files for "${project.name}"…`)
    const refreshed = await refreshProjects()
    project = projects.get(projectId)
    if (!refreshed || !project) {
        setStatus("Build cancelled: project files could not be refreshed.", true)
        return
    }

    if (project.preset == "asm") {
        showDialog({
            title: "NYI",
            message: "Build project currently does not support ASM project",
        })
        return
    }

    let sources = []

    for (let path of project.files) {
        let id = fileId(project.id, path)
        let openFile = files.get(id)

        if (openFile) {
            sources.push({
                path,
                content: openFile.model.getValue(),
                version: openFile.model.getAlternativeVersionId()
            })

            saveFile(openFile)
        } else {
            const result = await hostRequest("readFile", {
                project: project.id,
                path
            })

            sources.push({
                path,
                content: result.content,
                version: null
            })
        }
    }

    let startTime = performance.now()
    clearBuildLog()

    setBuildLogOpen(true)
    appendBuildLog(`Start building project "${project.name}" by ${project.author}`)

    let toolchain = await RiscvToolchain.create({
        target: "rv64gc",
        stdout: (str) => appendBuildLog(`[stdout] ${str}`),
        stderr: (str) => appendBuildLog(`[stderr] ${str}`)
    })

    toolchain.setTarget("rv64gc")

    for (let source of sources) {
        if (source.path.endsWith(".h"))
            toolchain.addHeader(source.path, source.content)
    }

    toolchain.addArg("-I/project/include")

    appendBuildLog(`Compiling C Files...`)

    let objects = []

    let build_dir = project.build.objects_dir

    if (!build_dir.endsWith("/")) build_dir += "/"
    
    for (let source of sources) {
        if (source.path.endsWith(".c")) {
            try {
                appendBuildLog(`Compiling C File [${source.path}]`)
                let result = toolchain.compileFile(source.path, source.content)

                let object_path = source.path.replace(/[\\/]/g, "_").replace(/\.c$/, ".o")

                objects.push({
                    path: object_path,
                    content: result
                })

                await writeBinaryFile(project.id, `${build_dir + object_path}`, result)
            } catch (err) {
                appendBuildLog(`Error while compiling [${source.path}]`)
                console.error(err)
                return
            }
        } else if (source.path.endsWith(".S") || source.path.endsWith(".s")) {
            try {
                appendBuildLog(`Compiling ASM File [${source.path}]`)
                let result = toolchain.compileAssemblyFile(source.path, source.content)

                let object_path = source.path.replace(/[\\/]/g, "_").replace(/\.s$/, ".o")

                objects.push({
                    path: object_path,
                    content: result
                })

                await writeBinaryFile(project.id, `${build_dir + object_path}`, result)
            } catch (err) {
                appendBuildLog(`Error while compiling [${source.path}]`)
                console.error(err)
                return
            }
        }
    }
    

    appendBuildLog("Linking...")

    for (let object of objects) {
        try {
            toolchain.addObject(object.path, object.content)
        } catch (err) {
            appendBuildLog(String(err))
            return
        }
    }

    let script = `ENTRY(_start)

MEMORY {
    RAM (rwx) : ORIGIN = 0x80000000, LENGTH = 128K
}

SECTIONS {
    . = ORIGIN(RAM);

    .text : {
    *(.text.init)
    *(.text .text.*)
    } > RAM

    .rodata : {
    *(.rodata .rodata.*)
    } > RAM

    .data : {
    *(.data .data.*)
    } > RAM

    .bss : {
    *(.bss .bss.*)
    *(COMMON)
    } > RAM

    . = ALIGN(16);
    __stack_top = ORIGIN(RAM) + LENGTH(RAM);
}`

    toolchain.setEntry("_start")
    toolchain.setLinkerScript(script)

    let exe = null

    try {
        exe = toolchain.link()
    } catch (err) {
        appendBuildLog(`Error while linking`)
        return
    }

    await writeBinaryFile(project.id, project.build.output_file, exe)

    const refreshedAfterBuild = await refreshProjects()

    if (!refreshedAfterBuild) {
        appendBuildLog("Warning: build files were written, but the file tree could not be refreshed.")
    }
    
    setActiveProject(project.id)

    let endTime = performance.now()
    appendBuildLog(`Build successful. Time: ${(endTime - startTime).toFixed(1)} ms`)
    appendBuildLog(`Active launch project: ${project.name}`)

    let readelf_h_output = await runBinutil("readelf", ["-h", "output.elf"], [(mod) => mod.FS.writeFile("output.elf", exe)])
    console.log(readelf_h_output.stdout)
    let readelf_l_output = await runBinutil("readelf", ["-l", "output.elf"], [(mod) => mod.FS.writeFile("output.elf", exe)])
    console.log(readelf_l_output.stdout)
}

async function buildFile(file) {
    if (!file || files.get(file.id) !== file) return;
    if (file.language !== "riscv-asm") {
        monaco.editor.setModelMarkers(file.model, "rvcompiler", []);
        return;
    }

    const versionId = file.model.getAlternativeVersionId();
    const source = file.model.getValue();
    if (file.id === activeFileId) setStatus("Validating assembly…");

    const result = await assemble(source);
    if (files.get(file.id) !== file || file.model.isDisposed() || file.model.getAlternativeVersionId() !== versionId) return;

    monaco.editor.setModelMarkers(file.model, "rvcompiler", markersForDiagnostics(file.model, result.diagnostics));
    if (file.id === activeFileId) setStatus(result.ok ? "Assembly is valid" : "Assembly has errors", !result.ok);
}

function scheduleBuild(file) {
    if (file.language !== "riscv-asm") return;
    if (file.validationTimer) clearTimeout(file.validationTimer);
    file.validationTimer = setTimeout(() => buildFile(file), 500);
}

async function refreshProjects() {
    setStatus("Loading projects…");
    try {
        const data = await hostRequest("listProjects");
        projects.clear();
        for (const project of data.projects) projects.set(project.id, project);
        if (!projects.has(selectedProjectId)) selectedProjectId = projects.keys().next().value || null;
        renderProjectTree();
        updateActionState();
        const issueCount = data.issues ? data.issues.length : 0;
        setStatus(issueCount ? `Loaded projects (${issueCount} invalid project skipped).` : "Projects loaded");
        return true;
    } catch (error) {
        setStatus(error.message, true);
        return false;
    }
}

async function createProject() {
    const values = await showDialog({
        title: "Create project",
        message: "Project ID can contain letters, digits, _ and -.",
        submitLabel: "Create",
        fields: [
            { name: "id", label: "Project ID", placeholder: "my-project", maxLength: 64 },
            { name: "name", label: "Display name", placeholder: "My Project", maxLength: 96 },
            {
                name: "preset",
                label: "Project template",
                value: "asm",
                options: [
                    { value: "asm", label: "RISC-V Assembly" },
                    { value: "c", label: "C" },
                    { value: "none", label: "Empty" }
                ]
            }
        ]
    });
    if (!values) return;

    const id = values.id;
    const name = values.name || id;
    const preset = values.preset;

    try {
        const data = await hostRequest("createProject", { id, name, preset });
        await refreshProjects();
        selectedProjectId = data.project.id;
        renderProjectTree();
        if (data.project.files.length > 0) await openFile(data.project.id, data.project.files[0]);
    } catch (error) {
        setStatus(error.message, true);
    }
}

async function createFile(projectId = selectedProjectId, directoryPath = "") {
    if (!projectId) return;

    const values = await showDialog({
        title: "Create file",
        message: `New file in '${directoryPath || projectId}'.`,
        submitLabel: "Create",
        fields: [{ name: "name", label: "File name", placeholder: "main.s", maxLength: 128 }]
    });
    if (!values || !values.name) return;

    const path = directoryPath ? `${directoryPath}/${values.name}` : values.name;

    try {
        await hostRequest("createFile", { project: projectId, path });
        await refreshProjects();
        await openFile(projectId, path);
    } catch (error) {
        setStatus(error.message, true);
    }
}

async function createDirectory(projectId = selectedProjectId, parentPath = "") {
    if (!projectId) return;

    const values = await showDialog({
        title: "Create directory",
        message: `New directory in '${parentPath || projectId}'.`,
        submitLabel: "Create",
        fields: [{ name: "name", label: "Directory name", placeholder: "src", maxLength: 128 }]
    });
    if (!values || !values.name) return;

    const path = parentPath ? `${parentPath}/${values.name}` : values.name;
    try {
        await hostRequest("createDirectory", { project: projectId, path });
        delete collapsedDirectories[directoryId(projectId, path)];
        await refreshProjects();
        setStatus("Directory created");
    } catch (error) {
        setStatus(error.message, true);
    }
}

function renameOpenFile(projectId, oldPath, newPath) {
    const oldId = fileId(projectId, oldPath);
    const file = files.get(oldId);
    if (!file) return;

    const newId = fileId(projectId, newPath);
    files.delete(oldId);
    file.id = newId;
    file.path = newPath;
    files.set(newId, file);

    if (activeFileId === oldId) activeFileId = newId;
}

function renameOpenDirectory(projectId, oldPath, newPath) {
    const prefix = `${oldPath}/`;
    const movedFiles = [];
    for (const [id, file] of files) {
        if (file.project === projectId && file.path.slice(0, prefix.length) === prefix) movedFiles.push({ id, file });
    }

    for (const moved of movedFiles) {
        const suffix = moved.file.path.slice(prefix.length);
        const newPathForFile = `${newPath}/${suffix}`;
        const newId = fileId(projectId, newPathForFile);
        files.delete(moved.id);
        moved.file.id = newId;
        moved.file.path = newPathForFile;
        files.set(newId, moved.file);
        if (activeFileId === moved.id) activeFileId = newId;
    }
}

function removeProjectFromWorkspace(projectId) {
    const ids = [];
    for (const [id, file] of files) {
        if (file.project === projectId) ids.push(id);
    }

    for (let index = 0; index < ids.length; index += 1) {
        removeFileFromWorkspace(ids[index]);
    }
}

function renameOpenProject(oldProjectId, newProjectId) {
    const movedFiles = [];
    for (const [id, file] of files) {
        if (file.project === oldProjectId) movedFiles.push({ id, file });
    }

    for (let index = 0; index < movedFiles.length; index += 1) {
        const moved = movedFiles[index];
        const newId = fileId(newProjectId, moved.file.path);
        files.delete(moved.id);
        moved.file.id = newId;
        moved.file.project = newProjectId;
        files.set(newId, moved.file);

        if (activeFileId === moved.id) activeFileId = newId;
    }
}

async function renameFile(project, path) {
    const values = await showDialog({
        title: "Rename file",
        message: `Rename '${path}' in '${project.id}'.`,
        submitLabel: "Rename",
        fields: [{ name: "path", label: "New file name", value: path, maxLength: 128 }]
    });
    if (!values || !values.path || values.path === path) return;

    try {
        await hostRequest("renameFile", { project: project.id, oldPath: path, newPath: values.path });
        renameOpenFile(project.id, path, values.path);
        await refreshProjects();
        renderTabs();
        renderProjectTree();
        scheduleWorkspaceStateSave();
        setStatus("File renamed");
    } catch (error) {
        setStatus(error.message, true);
    }
}

async function deleteFile(project, path) {
    const confirmed = await showDialog({
        title: "Delete file?",
        message: `'${path}' will be permanently deleted from '${project.id}'.`,
        submitLabel: "Delete",
        danger: true,
        fields: []
    });
    if (!confirmed) return;

    try {
        await hostRequest("deleteFile", { project: project.id, path });
        removeFileFromWorkspace(fileId(project.id, path));
        await refreshProjects();
        setStatus("File deleted");
    } catch (error) {
        setStatus(error.message, true);
    }
}

async function renameDirectory(project, path) {
    const values = await showDialog({
        title: "Rename directory",
        message: `Rename '${path}' in '${project.id}'. You may also enter a new relative path to move it.`,
        submitLabel: "Rename",
        fields: [{ name: "path", label: "New directory path", value: path, maxLength: 128 }]
    });
    if (!values || !values.path || values.path === path) return;

    try {
        await hostRequest("renameDirectory", { project: project.id, oldPath: path, newPath: values.path });
        renameOpenDirectory(project.id, path, values.path);
        renameCollapsedDirectoryState(project.id, path, values.path);
        await refreshProjects();
        renderTabs();
        renderProjectTree();
        updateActionState();
        scheduleWorkspaceStateSave();
        setStatus("Directory renamed");
    } catch (error) {
        setStatus(error.message, true);
    }
}

async function deleteDirectory(project, path) {
    const confirmed = await showDialog({
        title: "Delete empty directory?",
        message: `'${path}' can be deleted only when it is empty.`,
        submitLabel: "Delete directory",
        danger: true,
        fields: []
    });
    if (!confirmed) return;

    try {
        await hostRequest("deleteDirectory", { project: project.id, path });
        removeCollapsedDirectoryState(project.id, path);
        await refreshProjects();
        scheduleWorkspaceStateSave();
        setStatus("Directory deleted");
    } catch (error) {
        setStatus(error.message, true);
    }
}

async function updateProjectSettings(project, onlyName) {
    const fields = [{ name: "name", label: "Display name", value: project.name, maxLength: 96 }];
    const compiler = getCompilerSettings(project);
    const build = getBuildSettings(project);

    if (!onlyName) {
        fields.push({ type: "section", label: "Build output" });
        fields.push({
            name: "objects_dir",
            label: "Object files directory",
            value: build.objectsDir,
            placeholder: "build",
            maxLength: 128
        });
        fields.push({
            name: "output_file",
            label: "Final executable file",
            value: build.outputFile,
            placeholder: "build/output.elf",
            maxLength: 128
        });
        fields.push({ type: "section", label: "GNU assembler (GAS)" });
        fields.push({
            name: "gas_target",
            label: "Toolchain target",
            value: compiler.gas.target,
            placeholder: "riscv64-linux-gnu",
            maxLength: 96
        });
        fields.push({
            name: "gas_march",
            label: "-march",
            value: compiler.gas.march,
            placeholder: "rv64gc",
            maxLength: 64
        });
        fields.push({
            name: "gas_mabi",
            label: "-mabi",
            value: compiler.gas.mabi,
            placeholder: "lp64d",
            maxLength: 64
        });
        fields.push({
            name: "gas_extra_args",
            label: "Additional GAS arguments",
            value: compiler.gas.extraArgs,
            placeholder: "--gdwarf-4",
            maxLength: 1024
        });
        fields.push({ type: "section", label: "TinyCC (future)" });
        fields.push({
            name: "tinycc_target",
            label: "Target triple",
            value: compiler.tinycc.target,
            placeholder: "riscv64-unknown-elf",
            maxLength: 96
        });
        fields.push({
            name: "tinycc_extra_args",
            label: "Additional TinyCC arguments",
            value: compiler.tinycc.extraArgs,
            placeholder: "-nostdlib",
            maxLength: 1024
        });
    }

    const values = await showDialog({
        title: onlyName ? "Rename project" : "Project settings",
        message: `Settings for '${project.id}'.`,
        submitLabel: "Save",
        fields
    });
    if (!values || !values.name) return;

    try {
        await hostRequest("updateProjectSettings", {
            project: project.id,
            name: values.name,
            compiler: onlyName ? project.compiler : {
                gas: {
                    target: values.gas_target,
                    march: values.gas_march,
                    mabi: values.gas_mabi,
                    extra_args: values.gas_extra_args
                },
                tinycc: {
                    target: values.tinycc_target,
                    extra_args: values.tinycc_extra_args
                }
            },
            build: onlyName ? project.build : {
                objects_dir: values.objects_dir,
                output_file: values.output_file
            }
        });
        await refreshProjects();
        setStatus("Project settings saved");
    } catch (error) {
        setStatus(error.message, true);
    }
}

async function renameProjectId(project) {
    const values = await showDialog({
        title: "Rename project ID",
        message: "This changes the project folder, not its display name.",
        submitLabel: "Rename",
        fields: [{ name: "id", label: "New project ID", value: project.id, maxLength: 64 }]
    });
    if (!values || !values.id || values.id === project.id) return;

    try {
        const data = await hostRequest("renameProject", { oldId: project.id, newId: values.id });
        renameOpenProject(project.id, data.project.id);
        renameCollapsedProjectState(project.id, data.project.id);
        selectedProjectId = data.project.id;
        await refreshProjects();
        renderTabs();
        renderProjectTree();
        scheduleWorkspaceStateSave();
        setStatus("Project ID renamed");
    } catch (error) {
        setStatus(error.message, true);
    }
}

async function deleteProject(project) {
    const confirmed = await showDialog({
        title: "Delete project?",
        message: `'${project.name}' and every file in it will be permanently deleted.`,
        submitLabel: "Delete project",
        danger: true,
        fields: []
    });
    if (!confirmed) return;

    try {
        await hostRequest("deleteProject", { project: project.id });
        removeProjectFromWorkspace(project.id);
        workspaceStateStore.removeProject(project.id);
        delete collapsedProjects[project.id];
        removeCollapsedDirectoryState(project.id, "");
        if (selectedProjectId === project.id) selectedProjectId = null;
        await refreshProjects();
        scheduleWorkspaceStateSave();
        setStatus("Project deleted");
    } catch (error) {
        setStatus(error.message, true);
    }
}

function showFileContextMenu(event, project, path) {
    const parentPath = parentDirectory(path);
    showContextMenu(event, [
        { label: "Open", run: () => openFile(project.id, path) },
        { label: "New File…", run: () => createFile(project.id, parentPath) },
        { label: "New Directory…", run: () => createDirectory(project.id, parentPath) },
        { separator: true },
        { label: "Rename File…", run: () => renameFile(project, path) },
        { label: "Delete File…", danger: true, run: () => deleteFile(project, path) }
    ]);
}

function showDirectoryContextMenu(event, project, path) {
    showContextMenu(event, [
        { label: "New File…", run: () => createFile(project.id, path) },
        { label: "New Directory…", run: () => createDirectory(project.id, path) },
        { separator: true },
        { label: "Rename Directory…", run: () => renameDirectory(project, path) },
        { label: "Delete Empty Directory…", danger: true, run: () => deleteDirectory(project, path) }
    ]);
}

function showProjectContextMenu(event, project) {
    showContextMenu(event, [
        { label: "New File…", run: () => createFile(project.id) },
        { label: "New Directory…", run: () => createDirectory(project.id) },
        { separator: true },
        { label: "Project Settings…", run: () => updateProjectSettings(project, false) },
        { label: "Rename Project…", run: () => updateProjectSettings(project, true) },
        { label: "Rename Project ID…", run: () => renameProjectId(project) },
        { separator: true },
        { label: "Delete Project…", danger: true, run: () => deleteProject(project) }
    ]);
}

window.addEventListener("blur", () => {
    tooltipService.hide();
});

refreshButton.addEventListener("click", refreshProjects);
newProjectButton.addEventListener("click", createProject);
openSettingsButton.addEventListener("click", openSettings);
resetWorkspaceButton.addEventListener("click", resetWorkspace);
newFileButton.addEventListener("click", () => createFile());
newDirectoryButton.addEventListener("click", () => createDirectory());
saveFileButton.addEventListener("click", saveActiveFile);
buildProjectButton.addEventListener("click", () => buildProject(getCurrentProject()));
buildFileButton.addEventListener("click", () => buildFile(getActiveFile()));
toggleBuildLogButton.addEventListener("click", () => setBuildLogOpen(buildLog.classList.contains("collapsed")));
collapseBuildLogButton.addEventListener("click", () => setBuildLogOpen(buildLog.classList.contains("collapsed")));
clearBuildLogButton.addEventListener("click", clearBuildLog);
editor.onDidChangeCursorPosition(updateStatusBar);

window.addEventListener("keydown", (event) => {
    if (dialogService.isOpen()) {
        if (event.keyCode === 27) {
            event.preventDefault();
            dialogService.close(null);
        }
        return;
    }

    if (!event.ctrlKey) return;
    if (event.keyCode === 83) {
        event.preventDefault();
        saveActiveFile();
    } else if (event.keyCode === 78) {
        event.preventDefault();
        createFile();
    } else if (event.keyCode === 66) {
        event.preventDefault();
        buildFile(getActiveFile());
    }
});

const app = new EditorApp({
    bridge: hostBridge,
    refreshProjects,
    restoreWorkspaceState,
    setStatus
});

window.RVHost = app.createHostApi();

if (window.__RV_EDITOR_BROWSER_MOCK__) window.RVHost.start();

window.RVEditorUI = {
    appendBuildLog,
    clearBuildLog,
    writeBinaryFile,
    closeActiveDialog() {
        return dialogService.close(null);
    },
    showBuildLog() {
        setBuildLogOpen(true);
    },
    hideBuildLog() {
        setBuildLogOpen(false);
    }
};

updateActionState();
