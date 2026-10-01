export class EditorApp {
    constructor({ bridge, refreshProjects, restoreWorkspaceState, setStatus }) {
        this.bridge = bridge;
        this.refreshProjects = refreshProjects;
        this.restoreWorkspaceState = restoreWorkspaceState;
        this.setStatus = setStatus;
    }

    createHostApi() {
        return {
            resolve: (requestId, responseJson) => this.bridge.resolve(requestId, responseJson),
            start: () => this.start()
        };
    }

    async start() {
        if (!this.bridge.isAvailable()) {
            this.setStatus("Open this page through Garry's Mod to access projects.", true);
            return;
        }

        await this.refreshProjects();
        await this.restoreWorkspaceState();
    }
}
