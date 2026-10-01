export class LayoutManager {
    constructor({ sidebar, sidebarResizer, buildLog, buildLogResizer, workspace, onResize, onChange }) {
        this.sidebar = sidebar;
        this.buildLog = buildLog;
        this.workspace = workspace;
        this.onResize = onResize;
        this.onChange = onChange;
        this.sidebarWidth = 240;
        this.buildLogHeight = 180;

        this.installResizer(sidebarResizer, "x", 1, () => this.sidebar.offsetWidth, (width) => this.setSidebarWidth(width));
        this.installResizer(buildLogResizer, "y", -1, () => this.buildLog.offsetHeight, (height) => {
            if (!this.buildLog.classList.contains("collapsed")) this.setBuildLogHeight(height);
        });
    }

    setSidebarWidth(width) {
        const maximum = Math.max(150, document.documentElement.clientWidth - 300);
        this.sidebarWidth = Math.max(150, Math.min(Math.round(width), maximum));
        this.sidebar.style.flexBasis = `${this.sidebarWidth}px`;
    }

    setBuildLogHeight(height) {
        const maximum = Math.max(80, this.workspace.offsetHeight - 180);
        this.buildLogHeight = Math.max(80, Math.min(Math.round(height), maximum));
        if (!this.buildLog.classList.contains("collapsed")) this.buildLog.style.flexBasis = `${this.buildLogHeight}px`;
    }

    installResizer(handle, direction, deltaSign, getStartSize, onResize) {
        let startPosition = 0;
        let startSize = 0;
        let dragging = false;

        handle.addEventListener("mousedown", (event) => {
            if (event.button !== 0) return;
            event.preventDefault();
            dragging = true;
            startPosition = direction === "x" ? event.clientX : event.clientY;
            startSize = getStartSize();
            handle.classList.add("dragging");
        });

        window.addEventListener("mousemove", (event) => {
            if (!dragging) return;
            const position = direction === "x" ? event.clientX : event.clientY;
            onResize(startSize + (position - startPosition) * deltaSign);
            this.onResize();
        });

        window.addEventListener("mouseup", () => {
            if (!dragging) return;
            dragging = false;
            handle.classList.remove("dragging");
            this.onChange();
        });
    }
}
