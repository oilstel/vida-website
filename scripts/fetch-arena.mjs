// Fetches the site's content from Are.na and writes it to data/arena.json.
// Run by .github/workflows/update-content.yml on a schedule; can also be run
// by hand with `node scripts/fetch-arena.mjs`. No API key needed (public channel).

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const channelSlug = 'vida-website';
const apiBaseUrl = 'https://api.are.na/v2/';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outFile = path.join(root, 'data', 'arena.json');

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

const images = contents
    .filter(block =>
        block.class === 'Image' ||
        (block.class === 'Attachment' && block.attachment &&
         block.attachment.content_type &&
         block.attachment.content_type.startsWith('image/'))
    )
    .map(block => ({
        id: block.id,
        class: block.class,
        title: block.title || '',
        description: block.description || '',
        description_html: block.description_html || '',
        image: block.image ? {
            original: block.image.original ? { url: block.image.original.url } : null,
            display: block.image.display ? { url: block.image.display.url } : null
        } : null,
        attachment: block.attachment ? {
            url: block.attachment.url,
            content_type: block.attachment.content_type
        } : null
    }));

// Text blocks referenced from index.html via data-block-id
const html = await readFile(path.join(root, 'index.html'), 'utf8');
const blockIds = [...new Set([...html.matchAll(/data-block-id="(\d+)"/g)].map(match => match[1]))];

const blocks = {};
for (const id of blockIds) {
    const block = await getJson(`blocks/${id}`);
    blocks[id] = {
        description: block.description || '',
        content_html: block.content_html || ''
    };
}

const output = {
    channel: { metadata: { description: (channel.metadata && channel.metadata.description) || '' } },
    blocks,
    images
};

await mkdir(path.dirname(outFile), { recursive: true });
await writeFile(outFile, JSON.stringify(output, null, 2) + '\n');
console.log(`Wrote ${path.relative(root, outFile)}: ${images.length} images, ${blockIds.length} text blocks`);
