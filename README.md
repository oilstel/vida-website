# Vida Rucli's website

A one-page website at [vidarucli.com](https://vidarucli.com) whose content lives on Are.na, in [this channel](https://www.are.na/vida-rucli/vida-website). Vida edits the channel; the site rebuilds itself from it.

## Editing the content

Everything is edited on Are.na. Nothing in this repository needs to change.

| What | Where on Are.na |
| --- | --- |
| Short bio | Text block `36004069` |
| Expanded bio (behind the `+`) | Text block `36004064` |
| CV column | Text block `35973882` |
| Footer | Text block `35975163` |
| Image scroll | Every image in the channel |
| Image captions | Each image's description |
| Colours | The channel's description |

**Images** appear in the same order as on the channel page. Reorder them on Are.na to reorder them on the site. The caption shows when hovering an image on desktop; captions are hidden on mobile.

**Captions** accept Are.na's markdown: `*italic*`, `**bold**`, `[a link](https://…)`, and blank lines for paragraphs. A caption with a link stays open for a couple of seconds after the pointer leaves the image, so the link can be reached.

**Colours** are read from these lines in the channel description:

```
Background color: #3E2113
Background color in the left: #5C5B4B
Text color: #9599DF
Lines color: #140CFB
```

**Text blocks** can contain HTML as well as markdown.

### When changes appear

An edit on Are.na shows up on the site within about 15–20 minutes.

To check an edit straight away, open [vidarucli.com/?preview](https://vidarucli.com/?preview). That visit loads the content directly from Are.na, and the browser tab's title changes to "Vida Rucli (preview)" once it has. Only the person viewing sees it; everyone else gets the change at the next update.

## How it works

The site is plain HTML with the content already in it. A scheduled job fetches the content from Are.na, writes it into the page, copies the images into the site, and commits the result. Visitors never contact Are.na, so the site stays up if Are.na is down.

| File | Role |
| --- | --- |
| `template.html` | The page's markup, with empty elements where content goes. An element is filled from a text block through `data-block-id="…"`; `#images` is filled with the image scroll. |
| `index.html` | **Generated.** The template with the content filled in. Don't edit it by hand. |
| `images/` | **Generated.** Copies of the channel's images, at most 1800px on the longest side. |
| `scripts/build.mjs` | Fetches the content from Are.na, writes `index.html` and keeps `images/` in step with the channel. |
| `render.js` | Turns Are.na data into HTML. Used by both the build and `?preview`, so they produce the same markup. |
| `script.js` | The interactive parts only: captions, bio toggle, sticky header, favicon, and `?preview`. |
| `style.css` | Styles. |
| `.github/workflows/update-content.yml` | Runs the build and commits `index.html` and `images/` when they changed. |

The workflow runs:

- every 15 minutes,
- when `template.html`, `render.js`, `scripts/` or the workflow itself is pushed,
- by hand, from the Actions tab ("Update content from Are.na" → "Run workflow"), to update immediately.

The site is hosted on GitHub Pages from the `main` branch, so each commit publishes about a minute later. No API key is needed, because the channel is public.

### If Are.na is unavailable

If the build can't reach Are.na, gets back no images or an empty text block, or can't download an image, it fails without touching `index.html`, and the last good version stays live. GitHub emails the repository owner about the failed run.

### Images

The build downloads Are.na's "large" version of each image (the originals can be several MB each) into `images/`, named `<block id>-<version>.<extension>`. An image that is already there is not downloaded again, and one that has left the channel is deleted, so the folder only ever holds what the page uses. Git history still keeps deleted images, at roughly 0.1–0.3 MB each.

## Development

Requires Node 18 or later. There are no dependencies to install.

```sh
git pull                      # the workflow commits to main; always pull first
node scripts/build.mjs        # regenerate index.html
python3 -m http.server 8000   # view at http://localhost:8000
```

- Change markup in `template.html`, then rebuild. Pushing the template also triggers a rebuild on GitHub.
- To add a text block, add an empty element with its `data-block-id` to `template.html`. The build fails if such an element isn't empty.
- After changing `style.css` or `script.js`, bump their `?v=` numbers in `template.html` so browsers pick up the new files.
- If `git pull` reports a conflict in `index.html` or `images/`, keep either side and run the build again.

### Things to know

- GitHub pauses scheduled workflows after 60 days without activity in the repository. If the content stops updating after a long quiet period, re-enable the workflow in the Actions tab.
- Scheduled runs often start a few minutes late, which is why updates take 15–20 minutes and not exactly 15.

## Credits

Design by Vida Rucli

Development by:<br>
Elliott Cost<br>
[elliott.computer](https://elliott.computer)
