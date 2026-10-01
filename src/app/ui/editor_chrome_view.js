export class EditorChromeView {
    constructor(options) {
        Object.assign(this, options);
    }

    updateStatus() {
        const file = this.getActiveFile();
        const position = this.editor.getPosition();

        this.statusPosition.textContent = position
            ? `Ln ${position.lineNumber}, Col ${position.column}`
            : "Ln 1, Col 1";

        if (!file) {
            this.statusLanguage.textContent = "Plain Text";
            this.statusSaveState.textContent = "No file";
            this.statusProject.textContent = "Project: none";
            return;
        }

        const project = this.projects.get(file.project);
        this.statusLanguage.textContent = this.formatLanguage(file.language);
        this.statusSaveState.textContent = file.dirty ? "Modified" : "Saved";
        this.statusProject.textContent = `Project: ${project ? project.name : file.project}`;
    }

    renderBreadcrumbs() {
        this.clearElement(this.breadcrumbsElement);
        const file = this.getActiveFile();
        if (!file) {
            this.breadcrumbsElement.textContent = "No file selected";
            return;
        }

        const project = this.projects.get(file.project);
        const parts = [project ? project.name : file.project].concat(file.path.split("/"));
        for (let index = 0; index < parts.length; index += 1) {
            if (index > 0) {
                const divider = document.createElement("span");
                divider.className = "breadcrumb-divider";
                divider.textContent = ">";
                this.breadcrumbsElement.appendChild(divider);
            }

            const part = document.createElement("span");
            part.className = index === parts.length - 1 ? "breadcrumb-current" : "breadcrumb-part";
            part.textContent = parts[index];
            this.breadcrumbsElement.appendChild(part);
        }
    }
}
