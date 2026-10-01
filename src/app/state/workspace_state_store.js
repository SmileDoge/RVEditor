export class WorkspaceStateStore {
    constructor(options) {
        Object.assign(this, options);
        this.ready = false;
        this.saveTimer = null;
    }

    payload() {
        const collapsedDirectories = [];
        for (const key of Object.keys(this.collapsedDirectories)) {
            if (!this.collapsedDirectories[key]) continue;
            const separator = key.indexOf("\u0000");
            if (separator < 0) continue;
            collapsedDirectories.push({ project: key.slice(0, separator), path: key.slice(separator + 1) });
        }

        const activeFile = this.getActiveFile();
        return {
            open_files: [...this.files.values()].map((file) => ({ project: file.project, path: file.path })),
            active_file: activeFile ? { project: activeFile.project, path: activeFile.path } : null,
            active_project: this.getActiveProjectId(),
            collapsed_projects: Object.keys(this.collapsedProjects).filter((projectId) => this.collapsedProjects[projectId]),
            collapsed_directories: collapsedDirectories,
            sidebar_width: this.getSidebarWidth(),
            build_log_height: this.getBuildLogHeight()
        };
    }

    scheduleSave() {
        if (!this.ready) return;
        if (this.saveTimer) clearTimeout(this.saveTimer);
        this.saveTimer = setTimeout(async () => {
            this.saveTimer = null;
            try {
                await this.request("saveWorkspaceState", { state: this.payload() });
            } catch (error) {
                this.setStatus(`Could not save workspace layout: ${error.message}`, true);
            }
        }, 150);
    }

    applyCollapsedState(state) {
        this.clearObject(this.collapsedProjects);
        this.clearObject(this.collapsedDirectories);

        for (const projectId of state.collapsed_projects || []) {
            if (this.projects.has(projectId)) this.collapsedProjects[projectId] = true;
        }
        for (const entry of state.collapsed_directories || []) {
            const project = this.projects.get(entry.project);
            if (project && project.directories && project.directories.includes(entry.path)) {
                this.collapsedDirectories[this.directoryId(entry.project, entry.path)] = true;
            }
        }
    }

    applyPanelLayout(state) {
        if (typeof state.sidebar_width === "number") this.setSidebarWidth(state.sidebar_width);
        if (typeof state.build_log_height === "number") this.setBuildLogHeight(state.build_log_height);
    }

    renameProject(oldProjectId, newProjectId) {
        if (this.getActiveProjectId() === oldProjectId) this.setActiveProjectId(newProjectId);

        if (this.collapsedProjects[oldProjectId]) {
            delete this.collapsedProjects[oldProjectId];
            this.collapsedProjects[newProjectId] = true;
        }

        for (const key of Object.keys(this.collapsedDirectories)) {
            const separator = key.indexOf("\u0000");
            if (separator < 0 || key.slice(0, separator) !== oldProjectId) continue;
            const path = key.slice(separator + 1);
            delete this.collapsedDirectories[key];
            this.collapsedDirectories[this.directoryId(newProjectId, path)] = true;
        }
    }

    removeProject(projectId) {
        if (this.getActiveProjectId() === projectId) this.setActiveProjectId(null);
    }

    renameDirectory(projectId, oldPath, newPath) {
        const prefix = `${oldPath}/`;
        for (const key of Object.keys(this.collapsedDirectories)) {
            const separator = key.indexOf("\u0000");
            if (separator < 0 || key.slice(0, separator) !== projectId) continue;
            const path = key.slice(separator + 1);
            if (path !== oldPath && !path.startsWith(prefix)) continue;
            delete this.collapsedDirectories[key];
            this.collapsedDirectories[this.directoryId(projectId, newPath + path.slice(oldPath.length))] = true;
        }
    }

    removeDirectory(projectId, path) {
        const prefix = `${path}/`;
        for (const key of Object.keys(this.collapsedDirectories)) {
            const separator = key.indexOf("\u0000");
            if (separator < 0 || key.slice(0, separator) !== projectId) continue;
            const currentPath = key.slice(separator + 1);
            if (path === "" || currentPath === path || currentPath.startsWith(prefix)) delete this.collapsedDirectories[key];
        }
    }

    async restore() {
        try {
            const data = await this.request("getWorkspaceState");
            const state = data.state || {};
            this.applyPanelLayout(state);
            this.applyCollapsedState(state);
            this.renderProjectTree();

            for (const entry of state.open_files || []) {
                const project = this.projects.get(entry.project);
                if (project && project.files.includes(entry.path)) await this.openFile(entry.project, entry.path);
            }

            this.applyCollapsedState(state);
            if (state.active_project && this.projects.has(state.active_project)) {
                this.setActiveProjectId(state.active_project);
            }
            if (state.active_file) {
                const activeId = this.fileId(state.active_file.project, state.active_file.path);
                if (this.files.has(activeId)) this.activateFile(activeId, true);
            }

            this.ready = true;
            this.renderProjectTree();
            this.updateActionState();
            this.scheduleSave();
        } catch (error) {
            this.ready = true;
            this.setStatus(`Could not restore workspace layout: ${error.message}`, true);
        }
    }

    cancelPendingSave() {
        if (this.saveTimer) clearTimeout(this.saveTimer);
        this.saveTimer = null;
    }

    markNotReady() {
        this.ready = false;
    }

    clearObject(object) {
        for (const key of Object.keys(object)) delete object[key];
    }
}
