export class BuildLogView {
    constructor(options) {
        Object.assign(this, options);
    }

    setOpen(open) {
        if (open) {
            this.element.classList.remove("collapsed");
            this.element.style.flexBasis = `${this.getHeight()}px`;
        } else {
            this.element.classList.add("collapsed");
            this.element.style.flexBasis = "";
        }

        this.resizer.style.display = open ? "block" : "none";
        this.toggleButton.textContent = open ? "Hide" : "Show";
    }

    clear() {
        this.output.textContent = "";
    }

    append(message) {
        if (this.output.textContent === "Build output will appear here.") this.clear();
        if (this.output.textContent.length > 0) this.output.textContent += "\n";
        this.output.textContent += String(message);
        this.output.scrollTop = this.output.scrollHeight;
        console.log(message);
    }
}
