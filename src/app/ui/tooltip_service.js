export class TooltipService {
    constructor(element, delayMs = 350) {
        this.element = element;
        this.delayMs = delayMs;
        this.target = null;
        this.timer = null;
    }

    bind(root = document) {
        root.addEventListener("mouseover", (event) => {
            let target = event.target;
            while (target && target !== document.body && !target.hasAttribute("title") && !target.hasAttribute("data-tooltip")) {
                target = target.parentNode;
            }
            if (target && target !== document.body) this.show(target);
        });

        root.addEventListener("mouseout", (event) => {
            if (!this.target || this.target.contains(event.relatedTarget)) return;
            this.hide();
        });
    }

    hide() {
        if (this.timer) clearTimeout(this.timer);
        this.timer = null;
        this.target = null;
        this.element.setAttribute("hidden", "hidden");
    }

    show(target) {
        const text = target.getAttribute("data-tooltip") || target.getAttribute("title");
        if (!text) return;

        if (target.hasAttribute("title")) {
            target.setAttribute("data-tooltip", text);
            target.removeAttribute("title");
        }

        this.hide();
        this.target = target;
        this.timer = setTimeout(() => {
            if (this.target !== target) return;
            this.element.textContent = text;
            this.element.removeAttribute("hidden");
            // CEF may report a zero-sized rectangle until a visible node is measured once.
            this.element.offsetWidth;
            this.place();
        }, this.delayMs);
    }

    place() {
        if (!this.target) return;

        const rectangle = this.element.getBoundingClientRect();
        const targetRectangle = this.target.getBoundingClientRect();
        const width = document.documentElement.clientWidth || window.innerWidth;
        const height = document.documentElement.clientHeight || window.innerHeight;
        const left = Math.max(4, Math.min(
            targetRectangle.left + (targetRectangle.width - rectangle.width) / 2,
            width - rectangle.width - 4
        ));
        const below = targetRectangle.bottom + 7;
        const top = below + rectangle.height <= height - 4
            ? below
            : Math.max(4, targetRectangle.top - rectangle.height - 7);
        this.element.style.left = `${left}px`;
        this.element.style.top = `${top}px`;
    }
}
