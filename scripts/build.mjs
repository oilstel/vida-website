// Builds index.html from template.html plus the content on Are.na.
// Run by .github/workflows/update-content.yml on a schedule; can also be run
// by hand with `node scripts/build.mjs`. No API key needed (public channel).
//
// If Are.na can't be reached or returns something that looks broken, this
// exits with an error and leaves the existing index.html untouched.

import { readFile, writeFile, readdir, mkdir, unlink } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import '../render.js'; // defines globalThis.ArenaRender

const { decodeEntities, escapeHtml, renderBlock, renderImages, parseColors, isImageBlock, imageUrl } = globalThis.ArenaRender;

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

// Images: keep a copy in images/, so the site doesn't depend on Are.na's image
// servers. Files are named <block id>-<version>.<ext>; one that's already there
// is not downloaded again.
const imagesDir = path.join(root, 'images');
await mkdir(imagesDir, { recursive: true });
const existingFiles = await readdir(imagesDir);
const extensions = { 'image/webp': 'webp', 'image/jpeg': 'jpg', 'image/png': 'png', 'image/gif': 'gif', 'image/avif': 'avif', 'image/svg+xml': 'svg' };
const localFiles = {};
const baseNames = {};

for (const block of contents.filter(isImageBlock)) {
    const url = imageUrl(block);
    if (!url) throw new Error(`Image block ${block.id} has no image address`);
    
    // Are.na puts a hash of the file in the original's name; it changes if the file does
    const original = block.image && block.image.original ? block.image.original.url : url;
    const hashInName = original.match(/original_([0-9a-f]{8,})\./);
    const version = (hashInName ? hashInName[1] : createHash('sha1').update(url).digest('hex')).slice(0, 10);
    const base = `${block.id}-${version}`;
    baseNames[block.id] = base;
    
    let file = existingFiles.find(name => name.startsWith(base + '.'));
    if (!file) {
        const response = await fetch(url, { headers: { Accept: 'image/webp,image/*;q=0.8' } });
        if (!response.ok) throw new Error(`Failed to download image ${block.id}: ${response.status}`);
        const type = (response.headers.get('content-type') || '').split(';')[0].trim();
        const bytes = Buffer.from(await response.arrayBuffer());
        if (!extensions[type] || bytes.length === 0) {
            throw new Error(`Image ${block.id} came back as "${type}" (${bytes.length} bytes)`);
        }
        file = `${base}.${extensions[type]}`;
        await writeFile(path.join(imagesDir, file), bytes);
        console.log(`Downloaded images/${file} (${Math.round(bytes.length / 1024)} KB)`);
    }
    localFiles[block.id] = file;
}

// Link preview image (what shows when the address is shared in a message or
// on social media): the first image on the page. Kept as a JPEG at Are.na's
// "display" size (at most 1200px), because not every service accepts WebP.
// If that copy can't be made, the page's own copy of the image is used.
const firstImage = contents.filter(isImageBlock).reverse()[0];
let socialFile = localFiles[firstImage.id];
if (firstImage.class === 'Image' && firstImage.image && firstImage.image.display) {
    const name = `social-${baseNames[firstImage.id]}.jpg`;
    if (existingFiles.includes(name)) {
        socialFile = name;
    } else {
        try {
            const response = await fetch(firstImage.image.display.url, { headers: { Accept: 'image/jpeg' } });
            const type = (response.headers.get('content-type') || '').split(';')[0].trim();
            const bytes = Buffer.from(await response.arrayBuffer());
            if (!response.ok || type !== 'image/jpeg' || bytes.length === 0) {
                throw new Error(`got ${response.status} "${type}" (${bytes.length} bytes)`);
            }
            await writeFile(path.join(imagesDir, name), bytes);
            console.log(`Downloaded images/${name} (${Math.round(bytes.length / 1024)} KB)`);
            socialFile = name;
        } catch (error) {
            console.warn(`No JPEG for the link preview (${error.message}); using images/${socialFile}`);
        }
    }
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
    return open + '\n' + renderImages(contents, block => `images/${localFiles[block.id]}`) + '\n' + close;
});
if (!imagesFilled) throw new Error('Could not find <div id="images"> in template.html');

// Colours
const colors = parseColors(channel.metadata && channel.metadata.description);
const declarations = Object.entries(colors).map(([variable, value]) => `${variable}: ${value};`).join(' ');
if (declarations) {
    if (!html.includes('</head>')) throw new Error('Could not find </head> in template.html');
    html = html.replace('</head>', () => `    <style id="arena-colors">:root { ${declarations} }</style>\n</head>`);
}

// Description and link preview. The description is the short bio as plain
// text; if that can't be found, the one written in template.html stays.
const shortBioId = (html.match(/id="mini-bio"[^>]*data-block-id="(\d+)"/) || [])[1];
const description = shortBioId
    ? decodeEntities(renderBlock(blocks[shortBioId]).replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim()
    : '';
if (description) {
    html = html.replace(/(<meta name="description" content=")[^"]*(">)/, (match, open, close) => open + escapeHtml(description) + close);
}
const siteUrl = `https://${(await readFile(path.join(root, 'CNAME'), 'utf8')).trim()}/`;
const pageTitle = (html.match(/<title>([^<]*)<\/title>/) || [])[1] || '';
const pageDescription = (html.match(/<meta name="description" content="([^"]*)">/) || [])[1] || '';
const socialTags = [
    `<meta property="og:type" content="website">`,
    `<meta property="og:url" content="${siteUrl}">`,
    `<meta property="og:title" content="${pageTitle}">`,
    `<meta property="og:description" content="${pageDescription}">`,
    `<meta property="og:image" content="${siteUrl}images/${socialFile}">`,
    `<meta name="twitter:card" content="summary_large_image">`
];
html = html.replace('</head>', () => socialTags.map(tag => `    ${tag}\n`).join('') + '</head>');

// Favicon: a square in the left-hand background colour. It is a real file,
// linked from template.html, because search engines ignore an icon that only
// exists once the page's script has run.
const faviconColor = colors['--bg-color-left'] || '#053627'; // style.css default
await writeFile(path.join(root, 'favicon.svg'),
    `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48"><rect width="48" height="48" fill="${faviconColor}"/></svg>\n`);

// Mark the file as generated
html = html.replace(/<!DOCTYPE html>/i, match =>
    `${match}\n<!-- Generated from template.html by scripts/build.mjs. Edit template.html, not this file. -->`);

await writeFile(path.join(root, 'index.html'), html);

// Remove copies of images that are no longer in the channel
const inUse = new Set([...Object.values(localFiles), socialFile]);
for (const name of existingFiles) {
    if (!inUse.has(name)) {
        await unlink(path.join(imagesDir, name));
        console.log(`Removed images/${name}`);
    }
}
console.log(`Wrote index.html: ${imageCount} images, ${blockIds.length} text blocks, ${Object.keys(colors).length} colours`);
