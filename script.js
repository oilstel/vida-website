document.addEventListener('DOMContentLoaded', function() {
    // The content is already in the page: scripts/build.mjs writes it into
    // index.html from Are.na. This script only adds the interactive parts.
    setupCaptions();
    openLinksInNewTab();
    setupBioToggle();
    setupBioScroll();
    createDynamicFavicon();
    setupStickyHeader();
    
    // Update favicon if CSS variables are changed later (e.g., by ?preview)
    const observer = new MutationObserver(function() {
        createDynamicFavicon();
    });
    
    // Watch for style attribute changes on the document root
    observer.observe(document.documentElement, { 
        attributes: true,
        attributeFilter: ['style']
    });
    
    // Adding ?preview to the address reloads the content straight from Are.na,
    // to check an edit before the next scheduled build.
    if (new URLSearchParams(window.location.search).has('preview')) {
        loadPreview();
    }
});

// Make all links open in a new tab
function openLinksInNewTab() {
    document.querySelectorAll('a').forEach(link => {
        link.setAttribute('target', '_blank');
        if (!link.getAttribute('rel')) link.setAttribute('rel', 'noopener');
    });
}

// Captions show while hovering an image (see style.css). Captions with links
// also stay open briefly after leaving the image, so the pointer can travel
// across to the caption and click.
function setupCaptions() {
    const figures = document.querySelectorAll('#images figure');
    const closeOthers = current => {
        document.querySelectorAll('#images figure.keep-open').forEach(figure => {
            if (figure !== current) figure.classList.remove('keep-open');
        });
    };
    
    figures.forEach(figure => {
        const img = figure.querySelector('img');
        const figcaption = figure.querySelector('figcaption');
        if (!img || !figcaption) return;
        
        if (!figcaption.querySelector('a')) {
            // Hovering a link-less image closes any caption left open
            img.addEventListener('mouseenter', () => closeOthers(null));
            return;
        }
        
        let hideTimer;
        const close = () => {
            clearTimeout(hideTimer);
            figure.classList.remove('keep-open');
        };
        
        img.addEventListener('mouseenter', () => {
            closeOthers(figure);
            clearTimeout(hideTimer);
            figure.classList.add('keep-open');
        });
        img.addEventListener('mouseleave', () => {
            clearTimeout(hideTimer);
            hideTimer = setTimeout(close, 2500);
        });
        figcaption.addEventListener('mouseenter', () => clearTimeout(hideTimer));
        figcaption.addEventListener('mouseleave', close);
    });
}

// ?preview: replace the built content with the current content on Are.na.
// If anything fails, the built content simply stays in place.
async function loadPreview() {
    const channelSlug = 'vida-website';
    const apiBaseUrl = 'https://api.are.na/v2/';
    
    async function getJson(url) {
        // no-store: Are.na lets browsers cache the channel info for a week
        const response = await fetch(apiBaseUrl + url, { cache: 'no-store' });
        if (!response.ok) throw new Error(`Failed to fetch ${url}: ${response.status}`);
        return response.json();
    }
    
    try {
        // render.js is only needed here, so it's loaded on demand
        await new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = 'render.js?t=' + Date.now();
            script.onload = resolve;
            script.onerror = () => reject(new Error('Failed to load render.js'));
            document.head.appendChild(script);
        });
        const { renderBlock, renderImages, parseColors } = window.ArenaRender;
        
        // Colours from the channel description
        const channel = await getJson(`channels/${channelSlug}`);
        const colors = parseColors(channel.metadata && channel.metadata.description);
        for (const [variable, value] of Object.entries(colors)) {
            document.documentElement.style.setProperty(variable, value);
        }
        
        // Images
        let contents = [];
        for (let page = 1; ; page++) {
            const data = await getJson(`channels/${channelSlug}/contents?page=${page}&per=100&sort=position`);
            const pageContents = data.contents || [];
            contents = contents.concat(pageContents);
            if (pageContents.length < 100) break;
        }
        const imagesContainer = document.getElementById('images');
        if (imagesContainer) {
            imagesContainer.innerHTML = renderImages(contents);
            setupCaptions();
        }
        
        // Text blocks (the figures inside #images also carry data-block-id)
        const blockElements = [...document.querySelectorAll('[data-block-id]')]
            .filter(element => !element.closest('#images'));
        await Promise.all(blockElements.map(async element => {
            const block = await getJson(`blocks/${element.getAttribute('data-block-id')}`);
            element.innerHTML = renderBlock(block);
        }));
        
        openLinksInNewTab();
        
        // The only visible sign that this is the preview
        document.title += ' (preview)';
    } catch (error) {
        console.error('Preview failed, showing the built content instead:', error);
    }
}

// Toggle bio functionality
function setupBioToggle() {
    const toggleButton = document.getElementById('toggle-expanded-bio');
    const expandedBio = document.getElementById('expanded-bio');
    
    if (toggleButton && expandedBio) {
        // Initially hide the expanded bio
        expandedBio.style.display = 'none';
        
        // Add click event to toggle button
        toggleButton.addEventListener('click', function() {
            if (expandedBio.style.display === 'none') {
                // Expand
                expandedBio.style.display = 'block';
                toggleButton.textContent = '−'; // Em dash for minus
            } else {
                // Collapse
                expandedBio.style.display = 'none';
                toggleButton.textContent = '+';
            }
            document.dispatchEvent(new Event('bio-toggled'));
        });
    }
}

// A long expanded bio scrolls inside itself (see style.css). Browsers hold a
// scroll gesture on the element it started on, so on its own the bio would
// stop (and on iOS bounce) at its end while the page stayed put. The bounce is
// switched off in style.css; this hands the rest of the gesture, and whatever
// momentum is left, to the page.
function setupBioScroll() {
    const bio = document.getElementById('bio-container');
    if (!bio) return;
    
    const maxScroll = () => bio.scrollHeight - bio.clientHeight;
    
    // style.css switches off the bounce only while there is something to scroll
    const markOverflowing = () => bio.classList.toggle('overflowing', maxScroll() > 0);
    new ResizeObserver(markOverflowing).observe(bio);
    document.addEventListener('bio-toggled', markOverflowing);
    markOverflowing();
    // Is the bio unable to scroll any further in this direction?
    const atEnd = direction => direction > 0 ? bio.scrollTop >= maxScroll() - 1 : bio.scrollTop <= 0;
    
    // Mouse wheel and trackpad
    bio.addEventListener('wheel', function(event) {
        if (event.ctrlKey || !event.deltaY) return; // pinch-zoom, sideways
        if (maxScroll() <= 0) return; // nothing to scroll: the page scrolls as usual
        if (!atEnd(event.deltaY)) return;
        
        event.preventDefault();
        const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? window.innerHeight : 1;
        window.scrollBy(0, event.deltaY * unit);
    }, { passive: false });
    
    // Touch
    let touching = false;
    let lastY = 0;
    let lastTime = 0;
    let velocity = 0; // px per ms, positive = towards the bottom of the page
    let glideFrame = null;
    
    function stopGlide() {
        if (glideFrame) cancelAnimationFrame(glideFrame);
        glideFrame = null;
    }
    
    // Let the page coast to a stop, the way a flick normally does
    function glide() {
        stopGlide();
        if (Math.abs(velocity) < 0.1) return;
        let previous = performance.now();
        const step = now => {
            const elapsed = Math.min(now - previous, 50);
            previous = now;
            const before = window.scrollY;
            window.scrollBy(0, velocity * elapsed);
            velocity *= Math.pow(0.998, elapsed);
            const stuck = window.scrollY === before; // top or bottom of the page
            glideFrame = Math.abs(velocity) < 0.02 || stuck ? null : requestAnimationFrame(step);
        };
        glideFrame = requestAnimationFrame(step);
    }
    
    // Any new touch, anywhere, stops the coasting
    document.addEventListener('touchstart', stopGlide, { passive: true });
    
    bio.addEventListener('touchstart', function(event) {
        touching = true;
        velocity = 0;
        lastY = event.touches[0].clientY;
        lastTime = event.timeStamp;
    }, { passive: true });
    
    bio.addEventListener('touchmove', function(event) {
        if (event.touches.length !== 1) return;
        const y = event.touches[0].clientY;
        const delta = lastY - y;
        const elapsed = Math.max(event.timeStamp - lastTime, 1);
        lastY = y;
        lastTime = event.timeStamp;
        velocity = 0.7 * (delta / elapsed) + 0.3 * velocity;
        
        // A bio too short to scroll leaves the page to the browser
        if (delta && maxScroll() > 0 && atEnd(delta)) window.scrollBy(0, delta);
    }, { passive: true });
    
    const endTouch = function(event) {
        if (event.touches.length) return;
        touching = false;
        // A finger that rested before lifting is not a flick
        if (event.timeStamp - lastTime > 80) velocity = 0;
        if (maxScroll() > 0 && atEnd(velocity)) glide();
    };
    bio.addEventListener('touchend', endTouch, { passive: true });
    bio.addEventListener('touchcancel', endTouch, { passive: true });
    
    // A flick that is still carrying the bio when it reaches its end carries
    // on into the page
    let lastScrollTop = bio.scrollTop;
    let lastScrollTime = 0;
    bio.addEventListener('scroll', function(event) {
        const delta = bio.scrollTop - lastScrollTop;
        const elapsed = event.timeStamp - lastScrollTime;
        lastScrollTop = bio.scrollTop;
        lastScrollTime = event.timeStamp;
        if (touching || !delta || elapsed <= 0 || elapsed > 100) return;
        
        velocity = delta / elapsed;
        if (atEnd(delta)) glide();
    }, { passive: true });
}

// Favicon
function createDynamicFavicon() {
    // Get the --bg-color-left value from CSS
    const bgColorLeft = getComputedStyle(document.documentElement).getPropertyValue('--bg-color-left').trim();
    
    // Create SVG content - a simple square with the background color
    const svgContent = `
        <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
            <rect width="32" height="32" fill="${bgColorLeft}"/>
        </svg>
    `;
    
    // Convert the SVG to a data URL
    const faviconUrl = 'data:image/svg+xml;base64,' + btoa(svgContent);
    
    // Create or update the favicon link element
    let favicon = document.querySelector('link[rel="icon"]');
    if (!favicon) {
        favicon = document.createElement('link');
        favicon.rel = 'icon';
        document.head.appendChild(favicon);
    }
    
    // Set the favicon href to the SVG data URL
    favicon.href = faviconUrl;
}

// The bio starts at the bottom of the header and scrolls up with the page.
// Once its top reaches the top of the screen it is moved into #fixed-header,
// which holds it there while the rest of the page scrolls underneath.
function setupStickyHeader() {
    const header = document.querySelector('header');
    const bioContainer = document.getElementById('bio-container');
    const fixedHeader = document.getElementById('fixed-header');
    const headerColorContainer = document.getElementById('header-color-container');
    
    if (!header || !bioContainer || !fixedHeader || !headerColorContainer) return;
    
    // Match fixed header width to header-color-container
    function updateFixedHeaderWidth() {
        fixedHeader.style.width = getComputedStyle(headerColorContainer).width;
    }
    
    // Moving an element resets how far it is scrolled, so put that back
    function moveBio(parent) {
        if (bioContainer.parentNode === parent) return;
        const scrollTop = bioContainer.scrollTop;
        parent.appendChild(bioContainer);
        bioContainer.scrollTop = scrollTop;
    }
    
    // How far the page has to scroll for the bio's top to reach the top of
    // the screen. Worked out from the header each time, because the bio
    // changes height when it is expanded: an expanded bio that fills the
    // header is at the top already, and stays put from the first scroll.
    function switchPoint() {
        const headerTop = header.getBoundingClientRect().top + window.scrollY;
        return headerTop + Math.max(0, header.clientHeight - bioContainer.offsetHeight);
    }
    
    function update() {
        const scrollY = window.scrollY;
        moveBio(scrollY > 0 && scrollY >= switchPoint() ? fixedHeader : header);
    }
    
    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', function() {
        updateFixedHeaderWidth();
        update();
    });
    // The bio toggle changes the bio's height
    document.addEventListener('bio-toggled', update);
    
    updateFixedHeaderWidth();
    update();
}
