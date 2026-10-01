export class ProjectTreeView {
    constructor(options) {
        Object.assign(this, options);
    }

    render() {
        this.clearElement(this.element);
        if (this.projects.size === 0) {
            const empty = document.createElement("div");
            empty.id = "empty-state";
            empty.textContent = "No projects found.";
            this.element.appendChild(empty);
            return;
        }

        for (const project of this.projects.values()) this.appendProject(project);
    }

    appendProject(project) {
        const projectElement = document.createElement("section");
        projectElement.className = "project";
        const header = document.createElement("div");
        header.className = "project-header";
        const isCollapsed = this.collapsedProjects[project.id] === true;

        const toggle = document.createElement("button");
        toggle.className = "project-toggle";
        toggle.title = isCollapsed ? "Expand project" : "Collapse project";
        toggle.setAttribute("aria-label", toggle.title);
        toggle.appendChild(this.createDisclosureIcon(isCollapsed));
        toggle.addEventListener("click", () => {
            this.collapsedProjects[project.id] = !isCollapsed;
            this.render();
            this.scheduleWorkspaceStateSave();
        });
        header.appendChild(toggle);

        const button = document.createElement("button");
        button.className = "project-name";
        if (project.id === this.getSelectedProjectId()) button.classList.add("selected");
        button.textContent = project.name;
        button.title = project.id;
        button.addEventListener("click", () => this.selectProject(project.id));
        button.addEventListener("contextmenu", (event) => {
            this.selectProject(project.id);
            this.showProjectContextMenu(event, project);
        });
        header.appendChild(button);
        projectElement.appendChild(header);

        if (!isCollapsed) {
            const fileList = document.createElement("div");
            fileList.className = "file-list";
            this.appendDirectoryTree(project, this.buildDirectoryTree(project.files, project.directories || []), "", 0, fileList);
            projectElement.appendChild(fileList);
        }
        this.element.appendChild(projectElement);
    }

    selectProject(projectId) {
        this.setSelectedProjectId(projectId);
        this.render();
        this.updateActionState();
    }

    buildDirectoryTree(paths, directories) {
        const root = { directories: {}, files: [] };
        const ensureDirectory = (path) => {
            let node = root;
            for (const segment of path.split("/")) {
                if (!node.directories[segment]) node.directories[segment] = { directories: {}, files: [] };
                node = node.directories[segment];
            }
            return node;
        };
        for (const path of directories) ensureDirectory(path);
        for (const path of paths) {
            const parts = path.split("/");
            const node = parts.length > 1 ? ensureDirectory(parts.slice(0, -1).join("/")) : root;
            node.files.push(parts[parts.length - 1]);
        }
        return root;
    }

    appendDirectoryTree(project, node, parentPath, depth, container) {
        for (const name of Object.keys(node.directories).sort()) {
            const path = parentPath ? `${parentPath}/${name}` : name;
            const directoryNode = node.directories[name];
            const key = this.directoryId(project.id, path);
            const isCollapsed = this.collapsedDirectories[key] === true;
            const row = document.createElement("div");
            row.className = "folder-row";
            row.style.paddingLeft = `${depth * 14}px`;

            const toggle = document.createElement("button");
            toggle.className = "folder-toggle";
            toggle.title = isCollapsed ? "Expand directory" : "Collapse directory";
            toggle.setAttribute("aria-label", toggle.title);
            toggle.appendChild(this.createDisclosureIcon(isCollapsed));
            toggle.addEventListener("click", () => {
                this.collapsedDirectories[key] = !isCollapsed;
                this.render();
                this.scheduleWorkspaceStateSave();
            });
            row.appendChild(toggle);

            const label = document.createElement("button");
            label.className = "folder-name";
            label.textContent = name;
            label.title = path;
            label.addEventListener("click", () => this.selectProject(project.id));
            label.addEventListener("contextmenu", (event) => {
                this.selectProject(project.id);
                this.showDirectoryContextMenu(event, project, path);
            });
            row.appendChild(label);
            container.appendChild(row);
            if (!isCollapsed) this.appendDirectoryTree(project, directoryNode, path, depth + 1, container);
        }

        for (const name of node.files.slice().sort()) {
            const path = parentPath ? `${parentPath}/${name}` : name;
            this.appendFileRow(project, path, depth, container);
        }
    }

    appendFileRow(project, path, depth, container) {
        const id = this.fileId(project.id, path);
        const button = document.createElement("button");
        button.className = "file";
        button.style.paddingLeft = `${depth * 14}px`;
        if (id === this.getActiveFileId()) button.classList.add("active");

        const icon = document.createElement("span");
        icon.className = `file-icon ${this.getFileIconType(path)}`;
        icon.setAttribute("aria-hidden", "true");
        button.appendChild(icon);

        const label = document.createElement("span");
        label.className = "file-label";
        label.textContent = path.split("/").pop();
        button.appendChild(label);
        button.addEventListener("dblclick", () => this.openFile(project.id, path));
        button.addEventListener("click", () => this.selectProject(project.id));
        button.addEventListener("contextmenu", (event) => {
            this.selectProject(project.id);
            this.showFileContextMenu(event, project, path);
        });
        container.appendChild(button);
    }

    expandFileParents(projectId, path) {
        const parts = path.split("/");
        let directory = "";
        for (let index = 0; index < parts.length - 1; index += 1) {
            directory = directory ? `${directory}/${parts[index]}` : parts[index];
            delete this.collapsedDirectories[this.directoryId(projectId, directory)];
        }
    }
}
