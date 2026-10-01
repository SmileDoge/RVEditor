export class TabsView {
    constructor(options) {
        Object.assign(this, options);
    }

    render() {
        this.clearElement(this.element);

        if (this.isSettingsOpen()) this.appendSettingsTab();

        for (const [id, file] of this.files) {
            this.appendFileTab(id, file);
        }
    }

    appendSettingsTab() {
        const tab = document.createElement("button");
        tab.className = "tab active";
        tab.title = "Editor Settings";

        const label = document.createElement("span");
        label.className = "tab-label";
        label.textContent = "Settings";
        tab.appendChild(label);

        const close = document.createElement("span");
        close.className = "tab-close";
        close.textContent = "×";
        close.title = "Close settings";
        tab.appendChild(close);
        tab.addEventListener("click", (event) => {
            if (event.target === close) this.closeSettings();
        });
        this.element.appendChild(tab);
    }

    appendFileTab(id, file) {
        const tab = document.createElement("button");
        tab.className = "tab";
        if (id === this.getActiveFileId() && !this.isSettingsOpen()) tab.classList.add("active");
        if (file.dirty) tab.classList.add("dirty");
        tab.title = `${file.project}/${file.path}`;

        const label = document.createElement("span");
        label.className = "tab-label";
        label.textContent = file.path;
        tab.appendChild(label);

        const close = document.createElement("span");
        close.className = "tab-close";
        close.textContent = "×";
        close.title = "Close file";
        tab.appendChild(close);

        tab.addEventListener("click", async (event) => {
            if (event.target === close) await this.closeFile(id);
            else this.activateFile(id);
        });
        this.element.appendChild(tab);
    }
}
