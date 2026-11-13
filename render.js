// Turns Are.na data into the site's HTML.
// Shared by the build script (scripts/build.mjs, in Node) and by the browser
// when the page is opened with ?preview, so both produce the same markup.

(function (root) {
    // Decode one level of HTML entities, so HTML typed into an Are.na text
    // block (which Are.na escapes) becomes real markup. Entities not listed
    // here are left alone; the browser decodes those when it parses the page.
    function decodeEntities(html) {
        const named = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
        return String(html || '').replace(/&(?:#(\d+)|#x([0-9a-f]+)|(amp|lt|gt|quot|apos));/gi, (match, dec, hex, name) => {
            if (dec) return String.fromCodePoint(parseInt(dec, 10));
            if (hex) return String.fromCodePoint(parseInt(hex, 16));
            return named[name.toLowerCase()];
        });
    }

    function escapeHtml(text) {
        return String(text || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    // Inner HTML for an element with data-block-id
    function renderBlock(block) {
        const content = block.content_html || '';

        if (block.description && block.description.includes('display_as_html: true') &&
            content.includes('<pre><code>') && content.includes('</code></pre>')) {
            // Use the content between <pre><code> and </code></pre>
            return decodeEntities(content.split('<pre><code>')[1].split('</code></pre>')[0]);
        }
        if (block.description && block.description.includes('display_as_html: true')) {
            return content;
        }
        return decodeEntities(content);
    }

    function isImageBlock(block) {
        return block.class === 'Image' ||
            (block.class === 'Attachment' && block.attachment &&
             block.attachment.content_type &&
             block.attachment.content_type.startsWith('image/'));
    }

    function imageUrl(block) {
        if (block.class === 'Image' && block.image) {
            return block.image.original ? block.image.original.url : block.image.display.url;
        }
        if (block.class === 'Attachment' && block.attachment) {
            return block.attachment.url;
        }
        return '';
    }

    // Inner HTML for #images, from the channel's contents (in position order)
    function renderImages(contents) {
        return contents.filter(isImageBlock).reverse().map(block => {
            let caption = '';
            if (block.description_html) {
                // Are.na's rendered markdown (italics, bold, links, paragraphs)
                caption = `<div class="caption">${block.description_html}</div>`;
            } else if (block.description) {
                caption = `<p class="caption">${escapeHtml(block.description)}</p>`;
            }
            return `<figure data-block-id="${escapeHtml(block.id)}">` +
                `<img src="${escapeHtml(imageUrl(block))}" alt="${escapeHtml(block.title)}">` +
                `<figcaption>${caption}</figcaption>` +
                `</figure>`;
        }).join('\n');
    }

    // Colour settings written in the channel description
    function parseColors(description) {
        const settings = {
            '--bg-color': /Background color:\s*(#[0-9A-Fa-f]+)/,
            '--bg-color-left': /Background color in the left:\s*(#[0-9A-Fa-f]+)/,
            '--text-color': /Text color:\s*(#[0-9A-Fa-f]+)/,
            '--rule-color': /Lines color:\s*(#[0-9A-Fa-f]+)/
        };
        const colors = {};
        for (const [variable, pattern] of Object.entries(settings)) {
            const match = String(description || '').match(pattern);
            if (match) colors[variable] = match[1];
        }
        return colors;
    }

    root.ArenaRender = { renderBlock, renderImages, parseColors, isImageBlock };
})(typeof globalThis !== 'undefined' ? globalThis : this);
