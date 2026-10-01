export class ContextMenu {
    constructor(options) {
        Object.assign(this, options);
    }

    bind() {
        this.element.addEventListener("mousedown", (event) => event.stopPropagation());
        window.addEventListener("mousedown", (event) => {
            if (event.button !== 2) this.hide();
        });
        window.addEventListener("blur", () => this.hide());
    }

    hide() {
        this.element.setAttribute("hidden", "hidden");
        this.element.style.display = "none";
        this.clearElement(this.element);
    }

    show(event, actions) {
        event.preventDefault();
        this.hide();
        for (let index = 0; index < actions.length; index += 1) {
            const action = actions[index];
            if (action.separator) {
                const separator = document.createElement("div");
                separator.className = "context-separator";
                this.element.appendChild(separator);
                continue;
            }

            const button = document.createElement("button");
            button.className = action.danger ? "context-action danger" : "context-action";
            button.textContent = action.label;
            button.addEventListener("click", () => {
                this.hide();
                action.run();
            });
            this.element.appendChild(button);
        }

        this.element.removeAttribute("hidden");
        this.element.style.display = "block";
        this.element.style.left = `${event.clientX}px`;
        this.element.style.top = `${event.clientY}px`;

        const rectangle = this.element.getBoundingClientRect();
        const viewportWidth = document.documentElement.clientWidth || window.innerWidth;
        const viewportHeight = document.documentElement.clientHeight || window.innerHeight;
        this.element.style.left = `${Math.max(4, Math.min(event.clientX, viewportWidth - rectangle.width - 4))}px`;
        this.element.style.top = `${Math.max(4, Math.min(event.clientY, viewportHeight - rectangle.height - 4))}px`;
    }
}
