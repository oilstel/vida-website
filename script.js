document.addEventListener('DOMContentLoaded', function() {
    const channelSlug = 'vida-website';
    const apiBaseUrl = 'https://api.are.na/v2/';
    const imagesContainer = document.getElementById('images');
    const rightColumn = document.getElementById('right-column');
    
    // Add loading indicator
    function showLoading(element, message = 'Loading...') {
        if (!element) return;
        const loader = document.createElement('div');
        loader.className = 'loading';
        loader.innerHTML = `<p>${message}</p>`;
        element.appendChild(loader);
    }
    
    function removeLoading(element) {
        if (!element) return;
        const loader = element.querySelector('.loading');
        if (loader) {
            loader.remove();
        }
    }
    
    // Find all elements with data-block-id and populate them
    async function populateBlockElements() {
        const blockElements = document.querySelectorAll('[data-block-id]');
        
        for (const element of blockElements) {
            const blockId = element.getAttribute('data-block-id');
            if (blockId) {
                showLoading(element, ``);
                
                try {
                    const block = await getBlockById(blockId);
                    if (block) {
                        displayBlockContent(element, block);
                    }
                } catch (error) {
                    console.error(`Error fetching block ${blockId}:`, error);
                    element.innerHTML = `<p>Error loading block ${blockId}</p>`;
                } finally {
                    removeLoading(element);
                }
            }
        }
    }
    
    function displayBlockContent(element, block) {
        // Keep the original tag name
        const tagName = element.tagName.toLowerCase();
        
        // Clear existing content but preserve the data-block-id attribute
        const blockId = element.getAttribute('data-block-id');
        element.innerHTML = '';
        
        if (block.description && block.description.includes('display_as_html: true')) {
            // Extract content from within <pre><code> tags if they exist
            let content = block.content_html;
            if (content.includes('<pre><code>') && content.includes('</code></pre>')) {
                // Extract the content between <pre><code> and </code></pre>
                const preContent = content.split('<pre><code>')[1].split('</code></pre>')[0];
                
                // Unescape HTML entities (convert &lt; to <, &gt; to >, etc.)
                const unescapedContent = unescapeHtml(preContent);
                
                element.innerHTML = unescapedContent;
            } else {
                element.innerHTML = content;
            }
        } else {
            element.innerHTML = unescapeHtml(block.content_html);
        }
    }
    
    // Helper function to unescape HTML entities
    function unescapeHtml(html) {
        const textarea = document.createElement('textarea');
        textarea.innerHTML = html;
        return textarea.value;
    }
    
    async function fetchArenaChannel() {
        if (!imagesContainer) return;
        
        showLoading(imagesContainer, '');
        
        try {
            // Get channel information first
            const channelResponse = await fetch(`${apiBaseUrl}channels/${channelSlug}`, {
                method: 'GET',
                headers: { 'Cache-Control': 'no-cache' }
            });
            
            if (!channelResponse.ok) {
                throw new Error(`Failed to fetch channel: ${channelResponse.status}`);
            }
            
            const channelData = await channelResponse.json();
            
            // Parse the description for CSS variables
            if (channelData.metadata && channelData.metadata.description) {
                const description = channelData.metadata.description;
                
                // Extract color values using regex
                const bgColorMatch = description.match(/Background color:\s*(#[0-9A-Fa-f]+)/);
                const bgColorLeft = description.match(/Background color in the left:\s*(#[0-9A-Fa-f]+)/);
                const textColorMatch = description.match(/Text color:\s*(#[0-9A-Fa-f]+)/);
                const linesColorMatch = description.match(/Lines color:\s*(#[0-9A-Fa-f]+)/);
                
                // Update CSS variables if matches found
                if (bgColorMatch || bgColorLeft || textColorMatch || linesColorMatch) {
                    const root = document.documentElement;
                    
                    if (bgColorMatch && bgColorMatch[1]) {
                        root.style.setProperty('--bg-color', bgColorMatch[1]);
                    }
                    
                    if (bgColorLeft && bgColorLeft[1]) {
                        root.style.setProperty('--bg-color-left', bgColorLeft[1]);
                    }
                    
                    if (textColorMatch && textColorMatch[1]) {
                        root.style.setProperty('--text-color', textColorMatch[1]);
                    }
                    
                    if (linesColorMatch && linesColorMatch[1]) {
                        root.style.setProperty('--rule-color', linesColorMatch[1]);
                    }
                }
            }
            
            // Now fetch all blocks
            let allBlocks = [];
            let page = 1;
            let hasMore = true;
            
            while (hasMore) {
                const response = await fetch(`${apiBaseUrl}channels/${channelSlug}/contents?page=${page}&per=100&sort=position`, {
                    method: 'GET',
                    headers: { 'Cache-Control': 'no-cache' }
                });
                
                if (!response.ok) {
                    throw new Error(`Failed to fetch content: ${response.status}`);
                }
                
                const data = await response.json();
                
                if (data.contents && data.contents.length) {
                    allBlocks = [...allBlocks, ...data.contents];
                    page++;
                    hasMore = data.contents.length === 100; // If we got the max per page, there might be more
                } else {
                    hasMore = false;
                }
            }
            
            // Filter for image blocks
            const imageBlocks = allBlocks.filter(block => 
                block.class === 'Image' || 
                (block.class === 'Attachment' && block.attachment && 
                 block.attachment.content_type && 
                 block.attachment.content_type.startsWith('image/'))
            );
            
            displayImages(imageBlocks);
            
        } catch (error) {
            console.error('Error fetching Are.na channel:', error);
            imagesContainer.innerHTML = '<p>Error loading content. Please try again later.</p>';
        } finally {
            removeLoading(imagesContainer);
        }
    }
    
    function displayImages(imageBlocks) {
        if (!imagesContainer) return;
        
        if (imageBlocks.length === 0) {
            imagesContainer.innerHTML = '<p>No images found in this channel.</p>';
            return;
        }
        
        imagesContainer.innerHTML = '';
        
        // Reverse the order of image blocks
        const reversedBlocks = [...imageBlocks].reverse();
        
        reversedBlocks.forEach(block => {
            const figure = document.createElement('figure');
            figure.setAttribute('data-block-id', block.id);
            
            const img = document.createElement('img');
            
            // Handle different image sources based on block type
            if (block.class === 'Image') {
                img.src = block.image && block.image.original ? block.image.original.url : block.image.display.url;
            } else if (block.class === 'Attachment' && block.attachment) {
                img.src = block.attachment.url;
            }
            
            img.alt = block.title || '';
            
            const figcaption = document.createElement('figcaption');
            
            if (block.description) {
                const p = document.createElement('p');
                
                p.innerHTML += block.description;
                
                figcaption.appendChild(p);
            }
            
            figure.appendChild(img);
            figure.appendChild(figcaption);
            imagesContainer.appendChild(figure);
        });
    }
    
    // Helper function to get a specific block by ID
    async function getBlockById(blockId) {
        try {
            const response = await fetch(`${apiBaseUrl}blocks/${blockId}`, {
                method: 'GET',
                headers: { 'Cache-Control': 'no-cache' }
            });
            
            if (!response.ok) {
                throw new Error(`Failed to fetch block: ${response.status}`);
            }
            
            return await response.json();
        } catch (error) {
            console.error(`Error fetching block ${blockId}:`, error);
            return null;
        }
    }
    
    // Initialize
    populateBlockElements();
    fetchArenaChannel();
    
    // Set up bio toggle functionality
    setupBioToggle();
    
    // Initialize with default favicon
    createDynamicFavicon();
    
    // Make all links open external
    setTimeout(() => {
        document.querySelectorAll('a').forEach(link => {
            link.setAttribute('target', '_blank');
        });
    }, 1500); // Wait for content to load
    
    // Update favicon if CSS variables are changed later (e.g., from arena description)
    const observer = new MutationObserver(function() {
        createDynamicFavicon();
    });
    
    // Watch for style attribute changes on the document root
    observer.observe(document.documentElement, { 
        attributes: true,
        attributeFilter: ['style']
    });
});

// Toggle bio functionality
function setupBioToggle() {
    // We need to wait a bit for the content to be loaded from Are.na
    setTimeout(() => {
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
    }, 1000); // Wait 1 second for content to load
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