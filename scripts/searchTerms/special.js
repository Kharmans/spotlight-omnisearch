import { BaseSearchTerm } from "./baseSearchTerm";
import { MODULE_ID } from "../main";
import { getSetting, setSetting } from "../settings";

export const SPECIAL_SEARCHES = [];

export class SpecialSearchTerm extends BaseSearchTerm {
    constructor(...args) {
        super(...args);
        this.match = args[0].match.bind(this);
    }
}

const NOTE_MATCHING = ["note", "notes", "note:", "notes:", "n:", "n "];
const ROLL_MATCHING = ["roll", "!roll", "roll:", "r:", "r "];
const TIMER_MATCHING = ["timer", "timer:", "time", "time:", "t:", "t "];

SPECIAL_SEARCHES.push(
    //Calculator
    new SpecialSearchTerm({
        name: function (search) {
            try {
                return eval(search.query);
            } catch {
                //remove characters from the end until the last character is a number
                let query = search.query;
                while (query.length > 0 && isNaN(query[query.length - 1])) {
                    query = query.slice(0, -1);
                }
                try {
                    return eval(query);
                } catch {
                    return "...";
                }
            }
        },
        type: "special-app",
        data: {},
        img: "",
        icon: "fad fa-calculator",
        match: (query) => {
            return query && query.match(/^[0-9\+\-\*\/\(\)\.\s]*$/);
        },
        onClick: function (search) {
            navigator.clipboard.writeText(this.name);
            ui.notifications.info(game.i18n.localize(`${MODULE_ID}.notifications.calc-clipboard`));
        },
    }),
    //notes
    new SpecialSearchTerm({
        name: () => game.i18n.localize(`${MODULE_ID}.special.note.name`),
        description: (search) => {
            const noteText = search.query.replace(/(note|notes|!note|!notes|note:|notes:|!n|n:)/i, "").trim();
            return noteText;
        },
        type: "special-app",
        data: {},
        img: "",
        icon: "fad fa-sticky-note",
        match: (query) => {
            return NOTE_MATCHING.some((keyword) => query.startsWith(keyword));
        },
        onClick: async function (search) {
            const noteText = this.description;
            if (!noteText) return;
            const journalName = `Omnisearch Notes [${game.user.name}]`;
            let journal = game.journal.getName(journalName);
            if (!journal) {
                journal = await JournalEntry.create({
                    name: journalName,
                });
            }
            const todayDate = new Date().toLocaleDateString();
            const nowTime = new Date().toLocaleTimeString();
            let page = journal.pages.getName(todayDate);
            if (!page) {
                page = await journal.createEmbeddedDocuments("JournalEntryPage", [
                    {
                        name: todayDate,
                        type: "text",
                    },
                ]);
                page = page[0];
            }
            const currentContent = page.text.content ?? "";
            page.update({
                "text.content": `${currentContent} <h3>${nowTime}:</h3><p>${noteText}</p>`,
            });
            ui.notifications.info(game.i18n.localize(`${MODULE_ID}.notifications.note`));
        },
    }),
    //roll
    new SpecialSearchTerm({
        name: () => game.i18n.localize(`${MODULE_ID}.special.roll.name`),
        description: (search) => {
            const rollText = search.query.replace(/(roll|!roll|roll:|!r|r:|r )/i, "").trim();
            return rollText;
        },
        type: "special-app",
        data: {},
        img: "",
        icon: "fad fa-dice-d20",
        match: (query) => {
            return ROLL_MATCHING.some((keyword) => query.startsWith(keyword));
        },
        onClick: async function (search) {
            new Roll(this.description).toMessage();
        },
    }),
    //help
    new SpecialSearchTerm({
        name: () => game.i18n.localize(`${MODULE_ID}.special.help.name`),
        description: (search) => {
            const listElements = game.i18n.translations["spotlight-omnisearch"].special.help.list;
            return `<ul>${listElements.map((element) => `<li style="pointer-events:none">${element}</li>`).join("")}</ul>`;
        },
        type: "special-app",
        data: {},
        img: "",
        icon: "fad fa-question",
        match: (query) => {
            return query.includes("help") || query.startsWith("?");
        },
        onClick: async function (search) {},
    }),
    //timer
    new SpecialSearchTerm({
        name: () => {
            let label = game.i18n.localize(`${MODULE_ID}.special.timer.name`);
            const current = getSetting("appData").timer;
            if (current) {
                const remaining = current - Date.now();
                if (remaining > 0) {
                    const hours = Math.floor(remaining / 3600000);
                    const minutes = Math.floor((remaining % 3600000) / 60000);
                    let seconds = Math.floor((remaining % 60000) / 1000);
                    if (seconds < 10) seconds = `0${seconds}`;
                    label += `<hr><strong style="font-size: larger;">${hours ? `${hours}:` : ""}${minutes ? `${minutes}:` : ""}${seconds ? `${seconds}` : ""}</strong>`;
                }
            } else {
                if (current !== undefined) {
                    const setting = getSetting("appData");
                    delete setting.timer;
                    setSetting("appData", setting);
                }
            }
            return label;
        },
        description: (search) => {
            const noteText = search.query.replace(/(timer|timer:|time|time:|t:|t )/i, "").trim();
            const { hours, minutes, seconds } = parseTime(noteText);
            const textOutput = `${hours ? `${hours}h ` : ""}${minutes ? `${minutes}m ` : ""}${seconds ? `${seconds}s` : ""}`;
            return textOutput;
        },
        type: "special-app timer",
        data: {},
        img: "",
        icon: "fad fa-stopwatch",
        match: (query) => {
            return TIMER_MATCHING.some((keyword) => query.startsWith(keyword));
        },
        onClick: async function (search) {
            const noteText = this.query.replace(/(timer|timer:|time|time:|t:|t )/i, "").trim();
            const { hours, minutes, seconds } = parseTime(noteText);
            const totalSeconds = hours * 3600 + minutes * 60 + seconds;
            if (totalSeconds <= 0) return;
            const startTimestamp = Date.now();
            const endTimestamp = startTimestamp + totalSeconds * 1000;
            const setting = getSetting("appData");
            setting.timer = endTimestamp;
            await setSetting("appData", setting);
            ui.spotlightOmnisearch._onSearch();
        },
    }),
);

function parseTime(input) {
    let hours = 0,
        minutes = 0,
        seconds = 0;

    // Regular expressions to match different time formats
    const hourMinSecRegex = /(\d+)[\s:]+(\d+)[\s:]+(\d+)/;
    const minSecRegex = /(\d+)[\s:]+(\d+)/;
    const minutesRegex = /(\d+)\s*m/;
    const secondsRegex = /(\d+)\s*s/;

    // Check each regex pattern against the input
    if (hourMinSecRegex.test(input)) {
        const match = input.match(hourMinSecRegex);
        hours = parseInt(match[1]);
        minutes = parseInt(match[2]);
        seconds = parseInt(match[3]);
    } else if (minSecRegex.test(input)) {
        const match = input.match(minSecRegex);
        minutes = parseInt(match[1]);
        seconds = parseInt(match[2]);
    } else if (minutesRegex.test(input)) {
        const match = input.match(minutesRegex);
        minutes = parseInt(match[1]);
    } else if (secondsRegex.test(input)) {
        const match = input.match(secondsRegex);
        seconds = parseInt(match[1]);
    } else {
        const int = parseInt(input);
        if (!isNaN(int)) {
            seconds = int;
        }
        return { hours, minutes, seconds };
    }

    return { hours, minutes, seconds };
}
