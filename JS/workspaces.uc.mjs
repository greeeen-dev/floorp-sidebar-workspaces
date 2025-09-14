// ==UserScript==
// @include   main
// @loadOrder 11
// @ignorecache
// ==/UserScript==

/*

MIT License

Copyright (c) 2025 Green (@greeeen-dev)

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

*/

import * as ucApi from "chrome://userchromejs/content/uc_api.sys.mjs";

class WorkspacesWrapper {
    // A wrapper class for managing workspaces in Floorp directly from the window
    constructor() {
        this.workspacesModule = null;
        this.workspacesContext = null;
        this.tabManager = null;
        this.initialized = false;
        this.properInit = false;
        this.initInterval = null;
        this.dataRetrieveQueue = [];
    }

    async init() {
        this.workspacesModule = await import("chrome://noraneko/content/assets/js/modules/workspaces.js");
        let workspacesContext = this.workspacesModule.default.getCtx();

        // Sometimes the context is not available when the script is loaded, so we have to wait for it
        if (workspacesContext) {
            this.setManagers(workspacesContext);
        } else {
            console.warn("Workspaces context could not be retrieved, will do this later.");
            this.setInitInterval();
        }

        // Set init to true
        this.initialized = true;
    }

    setInitInterval() {
        if (this.properInit) {
            return;
        }

        this.initInterval = setInterval(() => {
            let workspacesContext = this.workspacesModule.default.getCtx();
            if (workspacesContext) {
                console.log("Workspaces context retrieved, initializing now.");

                // Set managers and init status
                this.setManagers(workspacesContext);
                this.properInit = true;

                // Signal to all queued classes that they can retrieve data now
                for (let queuedFunction of this.dataRetrieveQueue) {
                    queuedFunction();
                }
                this.dataRetrieveQueue = [];

                // Clear interval
                clearInterval(this.initInterval);
                this.initInterval = null;
            }
        }, 100);
    }

    setManagers(workspacesContext) {
        this.workspacesContext = workspacesContext;
        this.modalManager = workspacesContext.modalCtx;
        this.tabManager = workspacesContext.tabManagerCtx;
    }

    getCurrentWorkspaceID() {
        if (!this.initialized) {
            return;
        }

        return this.workspacesContext.getSelectedWorkspaceID();
    }

    setCurrentWorkspaceID(workspaceId) {
        if (!this.initialized) {
            return;
        }

        return this.tabManager.changeWorkspace(workspaceId);
    }

    createWorkspace(workspaceName = null) {
        if (!this.initialized) {
            return;
        }

        if (!workspaceName) {
            return this.workspacesContext.createNoNameWorkspace();
        } else {
            return this.workspacesContext.createWorkspace(workspaceName);
        }
    }
}

class PanelSidebarWorkspaces {
    // A class to bring back workspaces management in the panel sidebar, a Floorp 11
    // feature requested for Floorp 12.
    constructor() {
        this.browserMutationObserver = null;
        this.panelSidebarNode = null;
        this.workspacesWrapper = null;
        this.shownWorkspaces = [];
    }

    init() {
        this.setBrowserMutationObserver();
        this.workspacesWrapper = document.body.workspacesWrapper;

        // Get panel sidebar node (if possible)
        const sidebarSelectBox = document.getElementById("panel-sidebar-select-box");
        if (sidebarSelectBox) {
            this.panelSidebarNode = sidebarSelectBox;
        }

        // Set up observer
        // This also runs the UI initialization so we can only run it once workspace data is available
        if (this.workspacesWrapper.properInit) {
            this.setBrowserMutationObserver();
        } else {
            this.workspacesWrapper.dataRetrieveQueue.push(this.setBrowserMutationObserver.bind(this));
        }
    }

    setBrowserMutationObserver() {
        const browserElement = document.getElementById("browser");

        if (this.browserMutationObserver) {
            this.browserMutationObserver.disconnect();
        }

        // Check if #panel-sidebar-select-box exists
        this.browserMutationObserver = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                const sidebarSelectBox = document.getElementById("panel-sidebar-select-box");
                if (sidebarSelectBox) {
                    const needsUIInit = this.panelSidebarNode === null;
                    this.panelSidebarNode = sidebarSelectBox;

                    if (needsUIInit) {
                        this.initWorkspacesList();
                    }
                } else {
                    this.panelSidebarNode = null;
                }
            });
        });

        this.browserMutationObserver.observe(browserElement, {childList: true, subtree: true});
    }

    initWorkspacesList() {
        if (!this.panelSidebarNode) {
            return;
        }

        // Check if workspaces list already exists
        let workspacesList = document.getElementById("panel-sidebar-workspaces")
        if (workspacesList) {
            return;
        }

        // Create workspaces list container
        workspacesList = document.createElement("div");
        workspacesList.id = "panel-sidebar-workspaces";
        this.panelSidebarNode.appendChild(workspacesList);

        // Also add a spacer
        let sidebarSpacer = document.createXULElement("spacer");
        sidebarSpacer.id = "panel-sidebar-workspaces-spacer"
        sidebarSpacer.setAttribute("flex", "1");
        this.panelSidebarNode.appendChild(sidebarSpacer);

        // Re-add workspaces
        this.refreshWorkspacesList();
    }

    refreshWorkspacesListIfNeeded() {
        if (!this.panelSidebarNode) {
            return;
        }

        if (ucApi.Prefs.get("floorp.workspaces.v4.store").exists()) {
            let workspacesData = JSON.parse(ucApi.Prefs.get("floorp.workspaces.v4.store").value);

            // Check 1: check the workspaces data length
            if (workspacesData["data"].length !== this.shownWorkspaces.length) {
                this.refreshWorkspacesList();
            } else {
                // Check 2: compare workspace IDs
                for (let index in workspacesData["data"]) {
                    let workspaceId = workspacesData["data"][index][0];
                    if (!this.shownWorkspaces.includes(workspaceId)) {
                        this.refreshWorkspacesList();
                        break;
                    }
                }
            }

            // Update the selected workspace
            this.refreshSelectedWorkspace();
        }
    }

    refreshWorkspacesList() {
        if (!this.panelSidebarNode) {
            return;
        }

        // Get workspaces list
        let workspacesList = document.getElementById("panel-sidebar-workspaces");
        if (!workspacesList) {
            return;
        }

        // Clear existing workspaces
        while (workspacesList.firstChild) {
            workspacesList.removeChild(workspacesList.firstChild);
        }
        this.shownWorkspaces = [];

        // Get workspace data
        let workspacesData = {};
        if (ucApi.Prefs.get("floorp.workspaces.v4.store").exists()) {
            workspacesData = JSON.parse(ucApi.Prefs.get("floorp.workspaces.v4.store").value);
        }

        // Add workspaces
        if (workspacesData["data"]) {
            for (let index in workspacesData["data"]) {
                // Get workspace data
                let workspaceId = workspacesData["data"][index][0];
                let workspaceIcon = workspacesData["data"][index][1]["icon"];

                if (!workspaceIcon) {
                    workspaceIcon = `url("chrome://noraneko/content/assets/svg/fingerprint.svg")`;
                } else {
                    workspaceIcon = `url("chrome://noraneko/content/assets/svg/${workspaceIcon}.svg")`;
                }

                // Create workspace button
                let workspaceButton = document.createElement("div");
                workspaceButton.classList.add("panel-sidebar-workspace");
                workspaceButton.style.setProperty("--floorp-workspace-icon", workspaceIcon);
                workspaceButton.setAttribute("workspace", workspaceId);
                workspacesList.appendChild(workspaceButton);

                // Set selected attribute if this is the current workspace
                if (this.workspacesWrapper.getCurrentWorkspaceID() === workspaceId) {
                    workspaceButton.setAttribute("selected", "");
                }

                // Add event listener
                workspaceButton.addEventListener("click", () => {
                    if (this.workspacesWrapper) {
                        this.workspacesWrapper.setCurrentWorkspaceID(workspaceId);
                    }
                });
            }

            // Create "Add Workspace" button
            let addWorkspaceButton = document.createElement("div");
            addWorkspaceButton.id = "panel-sidebar-add-workspace";
            addWorkspaceButton.classList.add("panel-sidebar-workspace");

            // Add event listener to add workspace button
            addWorkspaceButton.addEventListener("click", () => {
                if (this.workspacesWrapper) {
                    this.workspacesWrapper.createWorkspace();
                    this.refreshWorkspacesList();
                }
            });

            // Add workspaces to shown workspaces
            workspacesList.appendChild(addWorkspaceButton);
        }
    }

    refreshSelectedWorkspace() {
        if (!this.panelSidebarNode) {
            return;
        }

        // Get workspaces list
        let workspacesList = document.getElementById("panel-sidebar-workspaces");
        if (!workspacesList) {
            return;
        }

        // Get current workspace ID
        let currentWorkspaceId = this.workspacesWrapper.getCurrentWorkspaceID();

        // Update selected attribute
        const workspaceButtons = workspacesList.querySelectorAll(".panel-sidebar-workspace");
        workspaceButtons.forEach((button) => {
            if (button.getAttribute("workspace") === currentWorkspaceId) {
                button.setAttribute("selected", "");
            } else {
                button.removeAttribute("selected");
            }
        });
    }
}

// Listen for workspace changes by observing the tabs list
let tabsList = document.getElementById("tabbrowser-arrowscrollbox");
let tabsListObserver = new MutationObserver(function (mutations) {
    mutations.forEach(function (mutationRecord) {
        if (document.body.panelSidebarWorkspaces) {
            document.body.panelSidebarWorkspaces.refreshWorkspacesListIfNeeded();
        }
    });
});
tabsListObserver.observe(tabsList, {attributes: true, childList: true, subtree: true});

// Initialize workspaces wrapper
document.body.workspacesWrapper = new WorkspacesWrapper();
document.body.workspacesWrapper.init().then(() => {
    // Initialize panel sidebar workspaces manager
    document.body.panelSidebarWorkspaces = new PanelSidebarWorkspaces();
    document.body.panelSidebarWorkspaces.init();
})