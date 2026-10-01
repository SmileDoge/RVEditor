if (!Array.prototype.at) {
    Object.defineProperty(Array.prototype, "at", {
        value: function(index) {
            index = Math.trunc(index) || 0;

            if (index < 0) {
                index += this.length;
            }

            if (index < 0 || index >= this.length) {
                return undefined;
            }

            return this[index];
        },
        writable: true,
        configurable: true
    });
}