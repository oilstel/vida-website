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
        });
    }
}

// A long expanded bio scrolls inside itself (see style.css). Browsers hold a
// wheel or trackpad gesture on the element it started on, so the page would
// stay put once the bio reaches its end. Hand the rest of the gesture to the
// page instead. Touch needs no help: the next swipe moves the page.
function setupBioScroll() {
    const bio = document.getElementById('bio-container');
    if (!bio) return;
    
    bio.addEventListener('wheel', function(event) {
        if (event.ctrlKey || !event.deltaY) return; // pinch-zoom, sideways
        
        const max = bio.scrollHeight - bio.clientHeight;
        if (max <= 0) return; // nothing to scroll: the page scrolls as usual
        
        const atEnd = event.deltaY > 0 ? bio.scrollTop >= max - 1 : bio.scrollTop <= 0;
        if (!atEnd) return;
        
        event.preventDefault();
        const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? window.innerHeight : 1;
        window.scrollBy(0, event.deltaY * unit);
    }, { passive: false });
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

// Simplified sticky header implementation
function setupStickyHeader() {
    // Get the necessary elements
    const bioContainer = document.getElementById('bio-container');
    const fixedHeader = document.getElementById('fixed-header');
    const headerColorContainer = document.getElementById('header-color-container');
    
    // Exit if elements don't exist
    if (!bioContainer || !fixedHeader || !headerColorContainer) return;
    
    // Store original parent
    const originalParent = bioContainer.parentNode;
    
    // Moving an element resets how far it is scrolled, so put that back
    function moveBio(parent) {
        const scrollTop = bioContainer.scrollTop;
        parent.appendChild(bioContainer);
        bioContainer.scrollTop = scrollTop;
    }
    
    // Track the scroll position where we should switch
    let switchPoint = 0;
    
    // Match fixed header width to header-color-container
    function updateFixedHeaderWidth() {
        const containerWidth = getComputedStyle(headerColorContainer).width;
        fixedHeader.style.width = containerWidth;
    }
    
    // More accurately calculate the switch point
    function calculateSwitchPoint() {
        // Only if bio is in original position
        if (bioContainer.parentNode === originalParent) {
            // Get actual position from top of document
            let element = bioContainer;
            let top = 0;
            
            do {
                top += element.offsetTop || 0;
                element = element.offsetParent;
            } while (element);
            
            switchPoint = top;
        }
    }
    
    // Initialize
    calculateSwitchPoint();
    updateFixedHeaderWidth();
    
    // Simple scroll handler with more precise comparison
    window.addEventListener('scroll', function() {
        const scrollY = window.scrollY || window.pageYOffset;
        
        // Use the absolute comparison - when bio should be at top of view
        if (scrollY >= switchPoint) {
            // Only move if it's not already in the fixed header
            if (bioContainer.parentNode !== fixedHeader) {
                moveBio(fixedHeader);
            }
        } else {
            // Only move if it's not already in the original parent
            if (bioContainer.parentNode !== originalParent) {
                moveBio(originalParent);
                
                // Recalculate after putting back in original position
                setTimeout(calculateSwitchPoint, 10);
            }
        }
    });
    
    // Update width and recalculate switch point when window is resized
    window.addEventListener('resize', function() {
        updateFixedHeaderWidth();
        
        // Reset to original position to get accurate measurements
        if (bioContainer.parentNode !== originalParent) {
            originalParent.appendChild(bioContainer);
        }
        
        // Allow DOM to update before measuring
        setTimeout(calculateSwitchPoint, 100);
    });
    
    // Do initial check
    if (window.scrollY >= switchPoint) {
        moveBio(fixedHeader);
    }
}

 