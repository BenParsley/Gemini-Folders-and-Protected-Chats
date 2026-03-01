# Gemini Folders and Protected Files

Adds folders to Gemini, Protected chats and a cleaner view of the sidebar.

## Legal Notice

Gemini Folders and Protected Files is an independent third-party browser extension.
It is not affiliated with, endorsed by, sponsored by, authorized by, or otherwise officially connected to Google LLC or the Google Gemini product.
Google and Gemini are trademarks of Google LLC, used only for descriptive compatibility purposes.
No official support, warranty, maintenance commitment, or representation is provided by Google for this project.

## Repository Structure

```text
img/
  Icon128.png
src/
  content.js
  emoji-data.json
  folder-emoji-selector.js
  menu-action-terms.js
  pinned-protection-shared.js
  pinned-protection-ui.js
  popup.css
  popup.html
  popup.js
  shared-chat-utils.js
  styles.css
manifest.json
README.md
LICENSE
```

## Load the Extension (Unpacked)

1. Open the browsers extensions page
2. Enable **Developer mode**.
3. Click **Load unpacked**.
4. Select the project root folder (the folder that contains `manifest.json`).

## Notes

- Manifest version: MV3
- Host target: `https://gemini.google.com/*`
- Sidebar behavior is implemented in `src/content.js`

## License

This project is licensed under the MIT License. See `LICENSE`.


