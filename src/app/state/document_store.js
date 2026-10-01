export class DocumentStore {
    constructor({ monaco, files, openingFiles, fileId, getLanguage, request, activateFile, renderTabs, updateActionState, setStatus, scheduleBuild, isActive }) {
        this.monaco = monaco;
        this.files = files;
        this.openingFiles = openingFiles;
        this.fileId = fileId;
        this.getLanguage = getLanguage;
        this.request = request;
        this.activateFile = activateFile;
        this.renderTabs = renderTabs;
        this.updateActionState = updateActionState;
        this.setStatus = setStatus;
        this.scheduleBuild = scheduleBuild;
        this.isActive = isActive;
    }

    create(project, path, source) {
        const id = this.fileId(project, path);
        const model = this.monaco.editor.createModel(
            source,
            this.getLanguage(path),
            this.monaco.Uri.parse(`riscv:///${encodeURIComponent(id)}`)
        );

        const file = {
            id,
            project,
            path,
            language: this.getLanguage(path),
            model,
            viewState: null,
            dirty: false,
            savedVersionId: model.getAlternativeVersionId(),
            validationTimer: null
        };

        model.onDidChangeContent(() => {
            const dirty = model.getAlternativeVersionId() !== file.savedVersionId;
            if (dirty !== file.dirty) {
                file.dirty = dirty;
                this.renderTabs();
                this.updateActionState();
            }
            this.scheduleBuild(file);
        });

        this.files.set(id, file);
        return file;
    }

    async open(project, path) {
        const id = this.fileId(project, path);
        if (this.files.has(id)) {
            this.activateFile(id);
            return;
        }

        if (this.openingFiles.has(id)) return this.openingFiles.get(id);

        const opening = (async () => {
            this.setStatus(`Opening ${path}…`);
            try {
                const data = await this.request("readFile", { project, path });
                this.create(project, path, data.content);
                this.activateFile(id);
            } catch (error) {
                this.setStatus(error.message, true);
            } finally {
                this.openingFiles.delete(id);
            }
        })();

        this.openingFiles.set(id, opening);
        return opening;
    }

    async save(file) {
        if (!file || this.files.get(file.id) !== file || !file.dirty) return false;

        const versionId = file.model.getAlternativeVersionId();
        if (this.isActive(file)) this.setStatus(`Saving ${file.path}…`);

        try {
            await this.request("writeFile", {
                project: file.project,
                path: file.path,
                content: file.model.getValue()
            });

            if (this.files.get(file.id) === file && file.model.getAlternativeVersionId() === versionId) {
                file.savedVersionId = versionId;
                file.dirty = false;
                this.renderTabs();
                this.updateActionState();
                if (this.isActive(file)) this.setStatus("Saved");
            } else if (this.isActive(file)) {
                this.setStatus("Saved an earlier version; newer changes remain unsaved.");
            }
            return true;
        } catch (error) {
            if (this.isActive(file)) this.setStatus(error.message, true);
            return false;
        }
    }
}
