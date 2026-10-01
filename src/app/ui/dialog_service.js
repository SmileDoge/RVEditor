export class DialogService {
    constructor(options) {
        Object.assign(this, options);
        this.activeDialog = null;
    }

    bind() {
        this.form.addEventListener("submit", (event) => {
            event.preventDefault();
            if (!this.activeDialog) return;

            const values = {};
            for (let index = 0; index < this.activeDialog.fields.length; index += 1) {
                const field = this.activeDialog.fields[index];
                values[field.name] = field.input.value.trim();
            }
            this.close(values);
        });

        this.cancelButton.addEventListener("click", () => this.close(null));
        this.backdrop.addEventListener("click", (event) => {
            if (event.target === this.backdrop) this.close(null);
        });
    }

    isOpen() {
        return this.activeDialog !== null;
    }

    close(result) {
        if (!this.activeDialog) return false;

        const dialog = this.activeDialog;
        this.activeDialog = null;
        this.backdrop.setAttribute("hidden", "hidden");
        this.backdrop.style.display = "none";
        this.setHostDialogOpen(false);
        dialog.resolve(result);
        return true;
    }

    show(options) {
        if (this.activeDialog) this.close(null);

        this.clearElement(this.fieldsElement);
        this.titleElement.textContent = options.title;
        this.messageElement.textContent = options.message || "";
        this.submitButton.textContent = options.submitLabel || "Confirm";
        this.submitButton.className = options.danger ? "danger" : "";

        const fields = [];
        for (let index = 0; index < (options.fields || []).length; index += 1) {
            const definition = options.fields[index];
            if (definition.type === "section") {
                const section = document.createElement("div");
                section.className = "dialog-section";
                section.textContent = definition.label;
                this.fieldsElement.appendChild(section);
                continue;
            }

            const wrapper = document.createElement("label");
            wrapper.className = "dialog-field";
            const label = document.createElement("span");
            label.textContent = definition.label;
            wrapper.appendChild(label);

            const input = definition.options ? document.createElement("select") : document.createElement("input");
            input.name = definition.name;
            if (definition.options) {
                for (let optionIndex = 0; optionIndex < definition.options.length; optionIndex += 1) {
                    const optionDefinition = definition.options[optionIndex];
                    const option = document.createElement("option");
                    option.value = optionDefinition.value;
                    option.textContent = optionDefinition.label;
                    option.selected = optionDefinition.value === definition.value;
                    input.appendChild(option);
                }
            } else {
                input.type = "text";
                input.value = definition.value || "";
                input.placeholder = definition.placeholder || "";
                input.maxLength = definition.maxLength || 128;
                input.autocomplete = "off";
            }

            wrapper.appendChild(input);
            this.fieldsElement.appendChild(wrapper);
            fields.push({ name: definition.name, input });
        }

        this.backdrop.removeAttribute("hidden");
        this.backdrop.style.display = "flex";
        this.setHostDialogOpen(true);

        return new Promise((resolve) => {
            this.activeDialog = { resolve, fields };
            setTimeout(() => (fields.length > 0 ? fields[0].input : this.submitButton).focus(), 0);
        });
    }
}
