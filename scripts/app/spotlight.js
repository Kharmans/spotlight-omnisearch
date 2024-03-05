import { MODULE_ID } from "../main.js";
import { SPECIAL_SEARCHES } from "../searchTerms/special.js";

import { INDEX, FILE_INDEX, buildIndex } from "../searchTerms/buildTermIndex.js";
import { getSetting } from "../settings.js";

export class Spotlight extends Application {
    constructor({ first } = {}) {
        super();
        this.first = first;
        buildIndex().then((r) => {
            if (r) this._onSearch();
        });
        this._onSearch = debounce(this._onSearch, 167);
    }

    static get APP_ID() {
        return this.name
            .split(/(?=[A-Z])/)
            .join("-")
            .toLowerCase();
    }

    get APP_ID() {
        return this.constructor.APP_ID;
    }

    static get defaultOptions() {
        return mergeObject(super.defaultOptions, {
            id: this.APP_ID,
            template: `modules/${MODULE_ID}/templates/${this.APP_ID}.hbs`,
            popOut: true,
            resizable: false,
            minimizable: false,
            width: 700,
            top: window.innerHeight / 4,
            title: game.i18n.localize(`${MODULE_ID}.${this.APP_ID}.title`),
        });
    }

    async getData() {
        return { first: this.first };
    }

    activateListeners(html) {
        super.activateListeners(html);
        html = html[0] ?? html;
        this._html = html;
        html.querySelector("input").addEventListener("input", this._onSearch.bind(this));
        //if enter is pressed on the search input, click on the first result
        html.querySelector("input").addEventListener("keydown", (event) => {
            if (event.key === "Enter") {
                event.preventDefault();
                const isShift = event.shiftKey;
                const isAlt = event.altKey;
                const firstItem = html.querySelector(".search-item");
                if (!firstItem) return;
                if (isShift) {
                    //find the first action button
                    const actionButton = firstItem.querySelector(".search-item-actions button");
                    if (actionButton) return actionButton.click();
                }
                if (isAlt) {
                    //find the second action button
                    const actionButton = firstItem.querySelectorAll(".search-item-actions button")[1];
                    if (actionButton) return actionButton.click();
                }
                firstItem?.click();
            }
            //if escape is pressed, close the spotlight
            if (event.key === "Escape") {
                this.close();
            }
            //if shift + space is pressed, close the spotlight
            if (event.key === " " && event.shiftKey) {
                this.close();
            }
        });
        //timeout for janky core behavior
        setTimeout(() => {
            //enable the input
            html.querySelector("input").disabled = false;
            //focus the input
            html.querySelector("input").focus();
        }, 50);
        if (getSetting("darkMode")) html.closest("#spotlight").classList.add("dark");
    }

    setPosition(...args) {
        super.setPosition(...args);
        //get max availeble vertical space
        const windowApp = this._html.closest("#spotlight");
        const top = windowApp.getBoundingClientRect().top;
        const searchHeight = 100;
        const maxHeight = window.innerHeight - top - searchHeight;
        const prev = this._html.querySelector("section").style.maxHeight;
        this._html.querySelector("section").style.maxHeight = `${maxHeight}px`;
        if (prev !== this._html.querySelector("section").style.maxHeight) {
            windowApp.classList.toggle("inverted", maxHeight < window.innerHeight / 3);
            this.setPosition({ height: "auto" });
        }
    }

    _onSearch() {
        const query = this._html.querySelector("input").value.toLowerCase().trim();
        const section = this._html.querySelector("section");
        section.classList.toggle("no-results", !query);
        if (!query) {
            this._html.querySelector("#search-result").innerHTML = "";
            this.setPosition({ height: "auto" });
            return;
        }
        const results = [];
        //match special searches
        SPECIAL_SEARCHES.forEach((search) => {
            search.query = query;
            if (search.match(query)) {
                results.push(new SearchItem(search));
            }
        });

        //match index

        INDEX.forEach((search) => {
            search.query = query;
            if (search.match(query)) {
                results.push(new SearchItem(search));
            }
        });

        //match file index
        FILE_INDEX.forEach((search) => {
            search.query = query;
            if (search.match(query)) {
                results.push(new SearchItem(search));
            }
        });

        //cap max results to 50
        results.splice(50);

        //set the list to the results
        const list = this._html.querySelector("#search-result");
        list.innerHTML = "";
        results.forEach((result) => {
            list.appendChild(result.element);
        });
        if (!results.length) {
            section.classList.add("no-results");
        }
        this.setPosition({ height: "auto" });
    }
}

class SearchItem {
    constructor(searchTerm) {
        this.name = searchTerm.name;
        this.description = searchTerm.description;
        this.type = searchTerm.type;
        this.data = searchTerm.data;
        this.img = searchTerm.img;
        if (!getSetting("showImages")) this.img = null;
        this.icon = Array.isArray(searchTerm.icon) ? searchTerm.icon : [searchTerm.icon];
        this.element = document.createElement("li");
        this.element.classList.add("search-item", ...this.type.split(" "));
        if (this.icon.length > 1) {
            this.element.classList.add("multi-icons");
        }
        this.searchTerm = searchTerm;
        this.render();
    }

    async render() {
        const icons = this.icon.map((icon) => `<i class="${icon}"></i>`).join("");
        this.element.innerHTML = `${this.img ? `<img src="${this.img}" alt="${this.name}">` : ""} ${icons} <div class="search-info"><span class="search-entry-name">${this.name}</span>${this.description ? `<p>${this.description}</p>` : ""}</div>`;
        const actions = this.getActions();
        if (actions) this.element.querySelector(".search-entry-name").insertAdjacentElement("afterend", actions);
        this.element.addEventListener("click", (e) => {
            this.searchTerm.onClick?.(e);
        });
        this.setDraggable();
    }

    getActions() {
        const actions = [];
        if (this.type == "Macro") {
            actions.push({
                name: `${MODULE_ID}.actions.execute`,
                icon: '<i class="fas fa-terminal"></i>',
                callback: async () => {
                    (await fromUuid(this.data.uuid)).execute();
                },
            });
        } else if (this.type == "Scene") {
            actions.push(
                {
                    name: `${MODULE_ID}.actions.view`,
                    icon: '<i class="fas fa-eye"></i>',
                    callback: async () => {
                        (await fromUuid(this.data.uuid)).view();
                    },
                },
                {
                    name: `${MODULE_ID}.actions.activate`,
                    icon: '<i class="fas fa-play"></i>',
                    callback: async () => {
                        (await fromUuid(this.data.uuid)).activate();
                    },
                },
            );
        }

        if (!actions.length) return null;
        const actionsContainer = document.createElement("div");
        actionsContainer.classList.add("search-item-actions");
        actions.forEach((action) => {
            const button = document.createElement("button");
            button.innerHTML = action.icon + " " + game.i18n.localize(action.name);
            button.addEventListener("click", (e) => {
                e.preventDefault();
                e.stopPropagation();
                action.callback();
            });
            actionsContainer.appendChild(button);
        });
        return actionsContainer;
    }

    setDragging() {
        setTimeout(() => {
            document.querySelector("#spotlight").classList.add("dragging");
        }, 1);
    }

    endDragging() {
        document.querySelector("#spotlight").classList.remove("dragging");
    }

    setDraggable() {
        if (this.data.uuid) {
            this.element.setAttribute("draggable", true);
            this.element.addEventListener("dragstart", (event) => {
                this.setDragging();
                event.dataTransfer.setData("text/plain", JSON.stringify({ type: this.data.documentName, uuid: this.data.uuid }));
            });
            this.element.addEventListener("dragend", () => {
                this.endDragging();
            });
        }
        if (this.type === "file" && this.data.dropData) {
            this.element.setAttribute("draggable", true);
            this.element.addEventListener("dragstart", (event) => {
                this.setDragging();
                event.dataTransfer.setData("text/plain", JSON.stringify(this.data.dropData));
            });
            this.element.addEventListener("dragend", () => {
                this.endDragging();
            });
        }
    }
}
