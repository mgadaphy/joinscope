# Privacy

Joinscope is built so that your database structure never leaves your computer. This page says exactly what it stores, what it never does, and how to check that yourself.

## The short version

- Joinscope is a folder of static files: HTML, CSS and JavaScript. Its libraries are in the `vendor` folder. It loads nothing from the internet and sends nothing anywhere.
- It never connects to your database and never asks for a password. You make the export; Joinscope only reads the file you give it.
- Your file is read by your browser, in your browser. It is not uploaded.
- Data rows are never kept. `INSERT` statements are counted and thrown away.
- What it remembers is stored in your browser's local storage on your computer, and you can remove it at any time.

## What is stored, and where

Joinscope uses your browser's `localStorage` (a small storage area the browser keeps per site, on your disk). Every key starts with `joinscope:` so it is easy to find.

| Key | What it holds |
|---|---|
| `joinscope:schemas` | The schemas you imported: for each one, its name, the date and time of import, and the parsed structure |
| `joinscope:lastSchema` | Which schema you looked at last, so it opens again next time |
| `joinscope:opts` | Your Explore tab settings: layout, colouring, hub threshold, spacing, effects and the checkboxes |
| `joinscope:theme` | Light, dark or HUD, once you have chosen one |
| `joinscope:sideHidden` | Whether you hid the side panel |

The samples are part of the Joinscope folder and are not stored.

### What "the parsed structure" contains

Not your original file, but everything Joinscope read from it:

- table, column, index, foreign key, view and trigger names,
- column types, defaults and comments, and table comments,
- the SQL of each view and the body of each trigger,
- the next `AUTO_INCREMENT` value and storage engine of each table,
- the row count of each table, when the file had data,
- any parser warnings.

Default values, comments, view SQL and trigger bodies are written by people and can contain anything. If your structure itself is sensitive, remember that it stays in your browser until you remove it.

If a structure is too large for local storage, Joinscope still shows it but says "Loaded, but too big to remember after closing the page." Nothing is stored for it.

### What the address bar shows

When you select a table, the address bar may end in `#table=orders`, and in the Spotlight `#spot=orders`. This stays on your computer like the rest of the page, but it does appear in your browser history.

## Removing what is stored

**One imported schema**: select it in the schema list, then choose **Forget this imported schema** at the bottom of the list and confirm. The preloaded samples cannot be forgotten, since they are part of the folder.

**Everything**: open your browser's developer tools (`F12`), go to the console, and run:

```js
Object.keys(localStorage).filter(k => k.startsWith('joinscope:')).forEach(k => localStorage.removeItem(k));
```

Or use the developer tools' storage view (called **Application** in Chrome and Edge, **Storage** in Firefox), open **Local Storage**, and delete the keys starting with `joinscope:`. Clearing your browser's site data also removes them.

Depending on the browser, pages opened from disk may share one storage area. That is why every key carries the `joinscope:` prefix: removing those keys removes Joinscope's data and nothing else.

## What is never done

- No network requests: no analytics, no fonts or scripts from the web, no update checks, no error reporting.
- No connection to your database, so no passwords, hosts or users are ever asked for.
- No fix is ever run. The SQL fixes are text for you to read, copy or save.
- No code is read. Joinscope works only from the schema you give it.

Exports (PNG, Mermaid, data dictionary, fix script, JSON) are made in your browser and saved through your browser's normal download, to wherever you choose. Copy buttons put text on your clipboard.

## The optional profile

A [profile](profiles.md) is a file you write, `profiles/profile.js`, in your own copy of the folder. Joinscope only reads it. It is listed in `.gitignore`, so it is not committed if you keep the folder in a git repository.

## Check it yourself

You do not have to take this page's word for it.

1. **Work offline.** Switch off Wi-Fi or unplug the network cable, then open `index.html`. Everything works: the samples, importing, every tab and every export.
2. **Watch the network.** Open the developer tools (`F12`), go to the **Network** tab, reload the page, and use Joinscope as usual. Every request listed is a local file from the Joinscope folder (its address starts with `file://`). Nothing goes to the internet.
3. **Read the code.** It is plain JavaScript with no build step: `js/app.js`, `js/spotlight.js`, `js/schema-model.js` and `js/parser.js`. Search them for `fetch`, `XMLHttpRequest` or `http`: there are no network calls. The libraries in `vendor` are listed with their licences in `vendor/LICENSES.md`.

Next: [FAQ and troubleshooting](faq.md)
