const isGmod = window.gmod && typeof window.gmod.request === "function";

if (!isGmod) {
    window.__RV_EDITOR_BROWSER_MOCK__ = true;

    const defaultCompiler = () => ({
        gas: { target: "riscv64-linux-gnu", march: "rv64gc", mabi: "lp64d", extra_args: "" },
        tinycc: { target: "", extra_args: "" }
    });
    const defaultBuild = () => ({ objects_dir: "build", output_file: "build/output.elf" });

    const projects = new Map();
    let workspaceState = {
        open_files: [],
        active_file: null,
        active_project: null,
        collapsed_projects: [],
        collapsed_directories: [],
        sidebar_width: 240,
        build_log_height: 180
    };

    function createProject(id, name, preset) {
        const project = {
            id,
            name,
            preset,
            author: "Browser preview",
            compiler: defaultCompiler(),
            build: defaultBuild(),
            directories: new Set(),
            files: new Map()
        };

        if (preset === "c") {
            project.files.set("src/main.c", "#include \"riscv.h\"\n\nint main(void)\n{\n    return 0;\n}\n");
            project.files.set("include/riscv.h", "#pragma once\n");
        } else if (preset === "asm") {
            project.files.set("src/main.s", ".text\n.globl _start\n\n_start:\n    li a0, 123\nloop:\n    j loop\n");
            project.files.set("include/riscv.inc", "; Shared assembly definitions\n");
        }

        for (const path of project.files.keys()) parentDirectories(project, path);
        project.directories.add(project.build.objects_dir);

        projects.set(id, project);
        return project;
    }

    createProject("assembler-test", "Assembler Test", "asm");
    createProject("c-example", "C Example", "c");

    function isSafePath(path) {
        return typeof path === "string"
            && path.length > 0
            && path.length <= 128
            && !path.includes("\\")
            && path.split("/").every((part) => /^[A-Za-z0-9][\w. -]*$/.test(part) && part !== "." && part !== "..");
    }

    function parentDirectories(project, path) {
        const parts = path.split("/");
        let current = "";
        for (let index = 0; index < parts.length - 1; index += 1) {
            current = current ? `${current}/${parts[index]}` : parts[index];
            project.directories.add(current);
        }
    }

    function projectData(project) {
        return {
            id: project.id,
            name: project.name,
            preset: project.preset,
            author: project.author,
            files: [...project.files.keys()].sort(),
            directories: [...project.directories].sort(),
            compiler: project.compiler,
            build: project.build
        };
    }

    function getProject(id) {
        const project = projects.get(id);
        if (!project) throw new Error("Project does not exist.");
        return project;
    }

    function handleRequest(operation, payload) {
        if (operation === "listProjects") {
            return { projects: [...projects.values()].map(projectData), issues: [] };
        }
        if (operation === "getWorkspaceState") return { state: workspaceState };
        if (operation === "saveWorkspaceState") {
            workspaceState = payload.state || workspaceState;
            return { saved: true };
        }
        if (operation === "resetWorkspaceState") {
            workspaceState = {
                open_files: [], active_file: null, active_project: null, collapsed_projects: [], collapsed_directories: [], sidebar_width: 240, build_log_height: 180
            };
            return { reset: true };
        }

        if (operation === "createProject") {
            if (!/^[A-Za-z0-9][\w-]*$/.test(payload.id || "")) throw new Error("Project ID is invalid.");
            if (projects.has(payload.id)) throw new Error("A project with this ID already exists.");
            if (!["asm", "c", "none"].includes(payload.preset)) throw new Error("Unknown project template.");
            return { project: projectData(createProject(payload.id, payload.name || payload.id, payload.preset)) };
        }

        if (operation === "renameProject") {
            if (!/^[A-Za-z0-9][\w-]*$/.test(payload.newId || "")) throw new Error("Project ID is invalid.");
            const project = getProject(payload.oldId);
            if (projects.has(payload.newId)) throw new Error("A project with this ID already exists.");
            projects.delete(payload.oldId);
            project.id = payload.newId;
            projects.set(project.id, project);
            return { project: projectData(project) };
        }

        const project = getProject(payload.project);
        if (operation === "readFile") {
            if (!project.files.has(payload.path)) throw new Error("File does not exist.");
            return { content: project.files.get(payload.path) };
        }
        if (operation === "writeFile") {
            if (!project.files.has(payload.path)) throw new Error("File does not exist.");
            project.files.set(payload.path, String(payload.content || ""));
            return { saved: true };
        }
        if (operation === "writeBinaryFile") {
            if (!isSafePath(payload.path)) throw new Error("File path is invalid.");
            if (typeof payload.content_base64 !== "string") throw new Error("Binary content must be base64.");
            let binary;
            try {
                binary = atob(payload.content_base64);
            } catch (error) {
                throw new Error("Binary content is not valid base64.");
            }
            if (binary.length > 2 * 1024 * 1024) throw new Error("File is larger than the 2 MiB limit.");
            parentDirectories(project, payload.path);
            project.files.set(payload.path, binary);
            return { saved: true, byte_length: binary.length };
        }
        if (operation === "createFile") {
            if (!isSafePath(payload.path)) throw new Error("File path is invalid.");
            if (project.files.has(payload.path)) throw new Error("A file with this name already exists.");
            parentDirectories(project, payload.path);
            project.files.set(payload.path, "");
            return { created: true };
        }
        if (operation === "renameFile") {
            if (!isSafePath(payload.oldPath) || !isSafePath(payload.newPath)) throw new Error("File path is invalid.");
            if (!project.files.has(payload.oldPath)) throw new Error("File does not exist.");
            if (project.files.has(payload.newPath)) throw new Error("A file with this name already exists.");
            const content = project.files.get(payload.oldPath);
            project.files.delete(payload.oldPath);
            parentDirectories(project, payload.newPath);
            project.files.set(payload.newPath, content);
            return { renamed: true };
        }
        if (operation === "deleteFile") {
            if (!project.files.delete(payload.path)) throw new Error("File does not exist.");
            return { deleted: true };
        }
        if (operation === "createDirectory") {
            if (!isSafePath(payload.path)) throw new Error("Directory path is invalid.");
            const parts = payload.path.split("/");
            for (let index = 1; index <= parts.length; index += 1) project.directories.add(parts.slice(0, index).join("/"));
            return { created: true };
        }
        if (operation === "renameDirectory") {
            if (!isSafePath(payload.oldPath) || !isSafePath(payload.newPath)) throw new Error("Directory path is invalid.");
            if (!project.directories.has(payload.oldPath)) throw new Error("Directory does not exist.");
            if (project.directories.has(payload.newPath)) throw new Error("A directory with this path already exists.");
            const prefix = `${payload.oldPath}/`;
            if (payload.newPath.startsWith(prefix)) throw new Error("A directory cannot be moved into itself.");

            const movedDirectories = [...project.directories].filter((path) => path === payload.oldPath || path.startsWith(prefix));
            const movedFiles = [...project.files.entries()].filter(([path]) => path.startsWith(prefix));
            parentDirectories(project, payload.newPath);
            for (const path of movedDirectories) project.directories.delete(path);
            for (const [path] of movedFiles) project.files.delete(path);
            for (const path of movedDirectories) project.directories.add(payload.newPath + path.slice(payload.oldPath.length));
            for (const [path, content] of movedFiles) project.files.set(payload.newPath + path.slice(payload.oldPath.length), content);
            return { renamed: true };
        }
        if (operation === "deleteDirectory") {
            const prefix = `${payload.path}/`;
            if (!project.directories.has(payload.path)) throw new Error("Directory does not exist.");
            if ([...project.directories].some((path) => path.startsWith(prefix)) || [...project.files.keys()].some((path) => path.startsWith(prefix))) {
                throw new Error("Directory is not empty. Delete or move its contents first.");
            }
            project.directories.delete(payload.path);
            return { deleted: true };
        }
        if (operation === "updateProjectSettings") {
            project.name = payload.name || project.name;
            if (payload.compiler) project.compiler = payload.compiler;
            if (payload.build) {
                project.build = payload.build;
                project.directories.add(project.build.objects_dir);
            }
            return { project: projectData(project) };
        }
        if (operation === "deleteProject") {
            projects.delete(project.id);
            return { deleted: true };
        }

        throw new Error(`Unsupported browser preview operation: ${operation}`);
    }

    window.gmod = {
        request(requestId, operation, payloadJson) {
            window.setTimeout(() => {
                let response;
                try {
                    response = { ok: true, data: handleRequest(operation, JSON.parse(payloadJson || "{}")) };
                } catch (error) {
                    response = { ok: false, error: error instanceof Error ? error.message : String(error) };
                }

                if (window.RVHost) window.RVHost.resolve(requestId, JSON.stringify(response));
            }, 0);
        }
    };
}
