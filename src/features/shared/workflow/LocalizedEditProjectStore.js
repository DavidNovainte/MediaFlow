(function initLocalizedEditProjectStore(globalScope) {
    const root = globalScope || window;
    const STORE_KEY = '__mediaflow_pending_localized_edit_project__';

    function cloneValue(value) {
        return root.LocalizedEditProject?.clone
            ? root.LocalizedEditProject.clone(value)
            : JSON.parse(JSON.stringify(value));
    }

    root.LocalizedEditProjectStore = {
        setPendingProject(project) {
            root[STORE_KEY] = cloneValue(project);
            return root[STORE_KEY];
        },
        peekPendingProject() {
            return root[STORE_KEY] ? cloneValue(root[STORE_KEY]) : null;
        },
        consumePendingProject() {
            const project = this.peekPendingProject();
            delete root[STORE_KEY];
            return project;
        },
        clearPendingProject() {
            delete root[STORE_KEY];
        }
    };
}(window));
