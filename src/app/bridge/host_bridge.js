export class HostBridge {
    constructor(timeoutMs = 15000) {
        this.timeoutMs = timeoutMs;
        this.nextRequestId = 1;
        this.pendingRequests = new Map();
    }

    isAvailable() {
        return window.gmod && typeof window.gmod.request === "function";
    }

    request(operation, payload = {}) {
        if (!this.isAvailable()) return Promise.reject(new Error("Garry's Mod bridge is unavailable."));

        const requestId = String(this.nextRequestId++);
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                this.pendingRequests.delete(requestId);
                reject(new Error(`Request '${operation}' timed out.`));
            }, this.timeoutMs);

            this.pendingRequests.set(requestId, { resolve, reject, timeout });

            try {
                window.gmod.request(requestId, operation, JSON.stringify(payload));
            } catch (error) {
                clearTimeout(timeout);
                this.pendingRequests.delete(requestId);
                reject(error);
            }
        });
    }

    resolve(requestId, responseJson) {
        const pending = this.pendingRequests.get(String(requestId));
        if (!pending) return;

        clearTimeout(pending.timeout);
        this.pendingRequests.delete(String(requestId));

        try {
            const response = JSON.parse(responseJson);
            if (response.ok) pending.resolve(response.data);
            else pending.reject(new Error(response.error || "Unknown host error."));
        } catch (error) {
            pending.reject(new Error(`Invalid host response: ${error.message}`));
        }
    }
}
