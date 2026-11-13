# Vida Rucli's website

This one-page website is built on Are.na, specifically [this channel](https://www.are.na/vida-rucli/vida-website).

## Blocks as content

The site's content is divided into Are.na blocks. Elements are populated with a block's content using a data attribute.

For example: `data-block-id="36003481"`. 

## Image Scroll

The site has a long image scroll that is populated with all the images from [this channel](https://www.are.na/vida-rucli/vida-website). The channel is queried, filtered by `block.class === 'Image'` and appended to `#images`.

## Baked content

To keep the page fast, the Are.na content is saved into `data/arena.json` and the site reads that file instead of calling the Are.na API on every visit. A GitHub Action (`.github/workflows/update-content.yml`) runs `scripts/fetch-arena.mjs` every 15 minutes and commits the file when something has changed on Are.na, so edits appear on the site within roughly 15–20 minutes. To update immediately, run the "Update content from Are.na" workflow by hand from the repo's Actions tab.

To preview an edit straight away without waiting, add `?live` to the address (`vidarucli.com/?live`): that visit loads directly from Are.na instead of the baked file. It only affects the person viewing.

If `data/arena.json` can't be loaded, the site falls back to the live Are.na API.

## Credits
Design by Vida Rucli

Development by:<br>
Elliott Cost<br>
[elliott.computer](https://elliott.computer)