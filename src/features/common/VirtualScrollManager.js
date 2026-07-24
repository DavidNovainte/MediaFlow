/**
 * VirtualScrollManager
 * Efficiently manages rendering of large lists by only rendering items in the viewport
 */
class VirtualScrollManager {
    constructor(options = {}) {
        this.container = options.container;     // Scrollable container element
        this.listElement = options.listElement; // Element to contain items
        this.itemHeight = options.itemHeight || 68; // Height of each item in px
        this.renderItem = options.renderItem;   // Function to render a single item
        this.items = [];                        // Full list of data items

        this.buffer = options.buffer || 5;      // Number of items to render above/below viewport
        this.visibleItems = [];                 // Currently rendered items

        this.ticking = false;

        this.init();
    }

    init() {
        if (!this.container || !this.listElement) return;

        // Force container filtering stlyes
        this.container.style.position = 'relative';
        this.container.style.overflowY = 'auto'; // Ensure it scrolls

        // Add scroll listener
        this.container.addEventListener('scroll', () => this.onScroll());

        // Initial render
        this.update();
    }

    setItems(items) {
        this.items = items;
        // Reset scroll?
        // this.container.scrollTop = 0; 
        this.update();
    }

    onScroll() {
        if (!this.ticking) {
            window.requestAnimationFrame(() => {
                this.update();
                this.ticking = false;
            });
            this.ticking = true;
        }
    }

    update() {
        if (!this.items.length) {
            this.listElement.innerHTML = '';
            this.listElement.style.height = '0px';
            return;
        }

        const scrollTop = this.container.scrollTop;
        const containerHeight = this.container.clientHeight;

        // Total height
        const totalHeight = this.items.length * this.itemHeight;
        this.listElement.style.height = `${totalHeight}px`;
        this.listElement.style.position = 'relative';

        // Calculate visible range
        let startNode = Math.floor(scrollTop / this.itemHeight) - this.buffer;
        startNode = Math.max(0, startNode);

        let visibleNodeCount = Math.floor(containerHeight / this.itemHeight) + 2 * this.buffer;
        visibleNodeCount = Math.min(this.items.length - startNode, visibleNodeCount);

        // Render items
        this.renderChunk(startNode, visibleNodeCount);
    }

    renderChunk(startNode, count) {
        // Clear current content? 
        // Better: Use a document fragment or diffing, but for simple virtual scroll:
        // We need to position items absolutely or translate them.

        const fragment = document.createDocumentFragment();

        // Clear list but keep height
        this.listElement.innerHTML = '';

        for (let i = startNode; i < startNode + count; i++) {
            if (i >= this.items.length) break;

            const item = this.items[i];
            const node = this.renderItem(item, i);

            if (node) {
                node.style.position = 'absolute';
                node.style.top = `${i * this.itemHeight}px`;
                node.style.left = '0';
                node.style.right = '0';
                node.style.height = `${this.itemHeight}px`;
                fragment.appendChild(node);
            }
        }

        this.listElement.appendChild(fragment);
    }
}
window.VirtualScrollManager = VirtualScrollManager;
