// Builds index.html from template.html plus the content on Are.na.
// Run by .github/workflows/update-content.yml on a schedule; can also be run
// by hand with `node scripts/build.mjs`. No API key needed (public channel).
//
// If Are.na can't be reached or returns something that looks broken, this
// exits with an error and leaves the existing index.html untouched.

import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import '../render.js'; // defines globalThis.ArenaRender

const { renderBlock, renderImages, parseColors, isImageBlock } = globalThis.ArenaRender;

const channelSlug = 'vida-website';
const apiBaseUrl = 'https://api.are.na/v2/';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function getJson(url) {
    for (let attempt = 1; ; attempt++) {
        try {
            const response = await fetch(apiBaseUrl + url, { headers: { 'Cache-Control': 'no-cache' } });
            if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
            return await response.json();
        } catch (error) {
            if (attempt === 3) throw new Error(`Failed to fetch ${url}: ${error.message}`);
            await new Promise(resolve => setTimeout(resolve, attempt * 2000));
        }
    }
}

let html = await readFile(path.join(root, 'template.html'), 'utf8');

// Channel description (holds the colour settings)
const channel = await getJson(`channels/${channelSlug}`);

// All blocks in the channel, in position order
let contents = [];
for (let page = 1; ; page++) {
    const data = await getJson(`channels/${channelSlug}/contents?page=${page}&per=100&sort=position`);
    const pageContents = data.contents || [];
    contents = contents.concat(pageContents);
    if (pageContents.length < 100) break;
}

const imageCount = contents.filter(isImageBlock).length;
if (imageCount === 0) {
    throw new Error('Are.na returned no images; keeping the existing index.html');
}

// Text blocks: fill every empty element that has a data-block-id
const blockIds = [...new Set([...html.matchAll(/data-block-id="(\d+)"/g)].map(match => match[1]))];
const blocks = {};
for (const id of blockIds) {
    blocks[id] = await getJson(`blocks/${id}`);
    if (!blocks[id].content_html) {
        throw new Error(`Are.na returned no content for block ${id}; keeping the existing index.html`);
    }
}

const filled = new Set();
html = html.replace(/(<(\w+)\b[^>]*\bdata-block-id="(\d+)"[^>]*>)\s*(<\/\2>)/g, (match, open, tag, id, close) => {
    filled.add(id);
    return open + renderBlock(blocks[id]) + close;
});
const missed = blockIds.filter(id => !filled.has(id));
if (missed.length) {
    throw new Error(`Could not fill block(s) ${missed.join(', ')}: in template.html their elements must be empty`);
}

// Images
let imagesFilled = false;
html = html.replace(/(<div id="images">)[\s\S]*?(<\/div>)/, (match, open, close) => {
    imagesFilled = true;
    return open + '\n' + renderImages(contents) + '\n' + close;
});
if (!imagesFilled) throw new Error('Could not find <div id="images"> in template.html');

// Colours
const colors = parseColors(channel.metadata && channel.metadata.description);
const declarations = Object.entries(colors).map(([variable, value]) => `${variable}: ${value};`).join(' ');
if (declarations) {
    if (!html.includes('</head>')) throw new Error('Could not find </head> in template.html');
    html = html.replace('</head>', () => `    <style id="arena-colors">:root { ${declarations} }</style>\n</head>`);
}

// Mark the file as generated
html = html.replace(/<!DOCTYPE html>/i, match =>
    `${match}\n<!-- Generated from template.html by scripts/build.mjs. Edit template.html, not this file. -->`);

await writeFile(path.join(root, 'index.html'), html);
console.log(`Wrote index.html: ${imageCount} images, ${blockIds.length} text blocks, ${Object.keys(colors).length} colours`);
