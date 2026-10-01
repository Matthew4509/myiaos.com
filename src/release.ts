// What this release shows. An app named here is left out of the desktop: it is not registered, so no Start menu entry,
// desktop icon, shortcut, key or notice reaches it, and the packager (tools/package.mjs) leaves out its stand-alone
// page. Its code stays in the repository: take the name off this list to bring the app back. The browser tests read
// this list too, so they check the hidden shape now and the whole app once it is back.
// Hidden for now: the two games, Office Printer and Planetziods.
export const HIDDEN_APPS: readonly string[] = ['printer', 'planetziods'];

// Apps each person chooses for themselves in the Application manager: they ship in every release, but a desktop only
// shows one (Start menu entry, window) after its person presses Install, and Remove takes it away again. The choice is
// kept in that person's own files (src/shell/installed.ts), so nobody else's desktop changes.
export const OPTIONAL_APPS: readonly string[] = ['officeprinter'];
