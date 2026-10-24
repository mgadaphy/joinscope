# Profiles

A profile tells Joinscope about one project. It is optional: without one, general rules apply.

To use one, copy `example-profile.js` to `profile.js` in this folder and edit it. `index.html` loads `profiles/profile.js` if it exists. `profile.js` is ignored by git, so your project's rules stay on your machine.

| Field | What it does |
|---|---|
| `name` | Shown as the project name |
| `framework` | `'laravel'` shows each fix as a Laravel migration line too. Laravel is also detected on its own from its `migrations` table. |
| `peopleTables` | Tables holding people. A delete elsewhere that would erase one of these by cascade is flagged as high. Default: tables named like `users`, `customers`, `employees`, `members`, `patients`, `students`. |
| `keep` | Tables that are empty or quiet on purpose |
| `accepted` | Findings reviewed and kept on purpose, each `{ kind, table, column, reason }`. They leave the list, and one summary names them with the reason. |
| `outOfScope` | Groups of tables the project no longer uses, each `{ pattern, label, reason }` |
| `dormant` | Tables the app reads but nothing writes, each `{ table, note }` |
