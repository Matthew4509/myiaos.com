// Office Printer (version B: the Canon, the seven wilder printers, the strike and PrintNet) in a MyiaOS window. The game
// is its own page, public/office-printer-b/ (plain JavaScript and script.json), shown in a frame, as the Reader is. It
// keeps no saved game and asks nothing of MyiaOS: it reads its script, and opens MyiaOS's own Reader (/reader/) for the
// books, which reaches the Gutenberg library through server/api/books.php with this person's sign-in. It is an optional
// app (src/release.ts OPTIONAL_APPS): a person adds it in the Application manager.
import { h } from '../core/dom.ts';
import type { AppDef } from '../shell/types.ts';
import { APPS } from './catalog.ts';

export const officePrinterApp: AppDef = {
  ...APPS.officeprinter,
  async launch(app) {
    app.root.classList.add('reader-app');
    app.root.append(h('iframe', { class: 'reader-app-frame', src: 'office-printer-b/index.html', title: 'Office Printer' }));
  },
};
