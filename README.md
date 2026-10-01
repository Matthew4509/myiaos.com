# MyiaOS

Home: [myiaos.com](https://myiaos.com)

A private desktop in your browser that you host yourself. Put it on your own web hosting and you get a desktop with
windows, a file explorer, notes, documents, mail, a calendar, chat between the accounts on your server, a book reader, and an AI
that can run entirely on your own device. Your files live on your server, not someone else's cloud. To upload files, drag onto the
desktop, and its uploaded and saved to the cloud.

## What's in it

- **Files and documents:** Explorer, Notepad and Notepad Pro, an editor with syntax highlighting, a spreadsheet,
  photos and a photo editor, a PDF viewer, a media player, archives (zip), and a recycle bin.
- **Everyday tools:** Mail (IMAP/SMTP, from your server), Calendar, Contacts, Calculator, Terminal, Task Manager,
  Shortcuts, and a Panel with today's events and a scratch pad.
- **Chat:** encrypted end to end between the accounts on your own server, with safety codes to check keys. You can
  delete your own messages (for everyone); the owner can clear General and choose, in Settings, whether messages vanish
  after 3, 7 or 30 days. Each person can also have their AI chats cleared after 3, 7 or 30 days.
- **AI:** Gemma 2 2B (the default, with a friendly character of its own), Qwen 3.5 0.8B or Qwen 3.5 4B run in the browser
  on your own graphics chip (WebGPU): nothing you type leaves your device. Chat › Agents also does Summarise, Rewrite and
  Ask about a file. Optionally, each person can add their own Claude or OpenRouter key (Settings › AI), each with a
  monthly spending cap. The built-in models are pinned to fixed versions and checked (SHA-256) before use; the model's
  program is checked in the browser before it runs. If Hugging Face or GitHub ever drops a pinned version, the owner's
  "Save to this MyiaOS" fetches it from the MyiaOS model mirror (myiaos.com/aimodels) instead.
- **Reader:** Sherlock Holmes built in; signed-in people also get the Project Gutenberg library (60,000-odd free
  books, searched on your server) and can save books to their own files.
- **Games and toys:** a RISC-V Studio with its own RV32I processor and example games.

## Security, in short

- Accounts with Argon2 password hashing, brakes on password guessing, two-step sign-in (authenticator app) with
  recovery codes, and a screen lock with a PIN.
- **Optional file encryption, in the browser** (My account > Encryption > Encrypt my files): every file is sealed
  with AES-256-GCM using a key that the server only ever holds wrapped by your password (PBKDF2-SHA256, 600,000
  rounds) and by a recovery key that never leaves your browser. With encryption on, the stored files cannot be read
  by the desktop's owner account or by anyone who copies the data folder. Lose both the password and the recovery
  key and the files cannot be recovered. This protects data at rest: whoever controls the server could change its
  code to capture a password as it is typed, so run MyiaOS on a server you control or trust.
- Chat is end to end only when everyone in a conversation has file encryption on (the app says which). Mail
  passwords and the chat key are stored as plain files unless file encryption is on. The owner account can reset
  other people's passwords, which opens their files unless those files are encrypted.
- Anyone not signed in sees only a book reader (Sherlock Holmes) with a small Log in link, and the screensaver shows
  the same; the owner can choose the plain sign-in instead. Every page asks search engines not to list it.
- The first visit to a new install asks for a set-up code read from the server's own files, so a stranger who finds
  a fresh site first cannot make themselves its owner.
- The real PHP code and all data sit outside the web root; strict security headers (Content Security Policy with
  Trusted Types, HSTS) are sent on every page. Adding a person, switching an account off or on, setting someone's
  password and turning off their two-step all ask for the owner's own password first.

No software is perfectly secure. Keep your host's PHP up to date, use HTTPS, and keep backups. IF using cpanel, you can
use their inbuilt tool to password protect that root folder for additional security. 

## Install on cPanel (or any host with a home folder beside public_html)

Needs **PHP 8.2 or newer** with Argon2 password hashing. Mail, video titles and Claude also need the `openssl`
extension; Claude and saving AI models to the server need `curl`.

1. Download the release zip (or build it yourself, below).
2. In cPanel File Manager, open your **home** folder (the one that contains `public_html`), upload the zip there and
   Extract. It adds files to `public_html/` and a new `myiaos/` folder beside it.
3. In cPanel > Terminal run `php myiaos/tools/server-check.php`. It names anything missing.
4. Copy `myiaos/config.example.php` to `myiaos/config.php` and set `'allow_remote' => true`. Only do this with HTTPS
   working on your domain.
5. Visit your site. The first visit sets up the **owner** account and asks for a set-up code: open
   `myiaos/data/accounts/SETUP-CODE.txt` in File Manager. The file is deleted once you are set up.

`INSTALL.txt` in the zip has the full notes (updating, AI models, a forgotten owner password). Do not put the site
behind a proxy or "Flexible SSL" CDN: the server must see each visitor's real address and a real HTTPS connection.

## Build from source

Needs Node.js 22.13 or newer. PHP 8.2+ is needed for the server and its tests.

On Windows, run `git config --global core.longpaths true` before cloning: some file paths in the bundled Claude
library (`server/vendor/`) are longer than Windows allows by default, and the clone stops partway without it.

```
npm install
npm run build      # the page into out/
npm run package    # the release zip into dist/
npm test           # unit and server tests (set PHP_BIN to your php if it is not on the PATH)
npm run check      # type check
```

To run it locally: `php -S 127.0.0.1:3042 -t out server/dev-router.php` from this folder, then open
http://127.0.0.1:3042. Data goes to `../desktop-data` unless `DESKTOP_DATA_DIR` says otherwise.

## Licence

MyiaOS is free to use, free to change, and free to share, but **not for sale**: see [LICENSE](LICENSE). The
libraries it bundles keep their own licences (About > Credits in the app lists them).
