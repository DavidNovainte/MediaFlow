/**
 * ContextMenu.js
 * 通用右键菜单组件 (支持多级菜单)
 */

class ContextMenu {
    constructor() {
        this.activeMenu = null;
        this.initStyles();

        // Global click to close
        document.addEventListener('click', () => this.hide());
        document.addEventListener('contextmenu', (e) => {
            // If click is outside menu, hide it
            if (!this.closest(e.target, '.mediaflow-context-menu')) {
                this.hide();
            }
        });
    }

    closest(target, selector) {
        if (typeof target?.closest === 'function') return target.closest(selector);
        return target?.parentElement?.closest?.(selector) || null;
    }

    initStyles() {
        if (document.getElementById('mediaflow-context-menu-style')) return;
        const style = document.createElement('style');
        style.id = 'mediaflow-context-menu-style';
        style.textContent = `
            .mediaflow-context-menu {
                position: fixed;
                z-index: 10000;
                background: var(--bg-card);
                border: 1px solid var(--bg-tertiary);
                border-radius: 6px;
                box-shadow: 0 4px 6px rgba(0, 0, 0, 0.3);
                padding: 4px 0;
                min-width: 180px;
                color: var(--text-secondary);
                font-family: system-ui, -apple-system, sans-serif;
                font-size: 13px;
                animation: menu-fade-in 0.1s ease-out;
            }
            @keyframes menu-fade-in {
                from { opacity: 0; transform: scale(0.95); }
                to { opacity: 1; transform: scale(1); }
            }
            .mediaflow-menu-item {
                padding: 8px 16px;
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: space-between;
                position: relative;
            }
            .mediaflow-menu-item:hover {
                background: var(--bg-tertiary);
                color: #fff;
            }
            .mediaflow-menu-item.disabled {
                opacity: 0.5;
                pointer-events: none;
            }
            .mediaflow-menu-divider {
                height: 1px;
                background: var(--bg-tertiary);
                margin: 4px 0;
            }
            .mediaflow-submenu-arrow {
                font-size: 10px;
                opacity: 0.7;
            }
            
            /* Submenu */
            .mediaflow-submenu {
                display: none;
                position: absolute;
                left: 100%;
                top: 0;
                /* No margin - avoid gap that breaks hover */
            }
            
            /* Create invisible hover bridge to prevent menu disappearing */
            .mediaflow-menu-item.has-submenu::after {
                content: '';
                position: absolute;
                right: -10px;
                top: 0;
                width: 10px;
                height: 100%;
            }
            
            .mediaflow-menu-item:hover > .mediaflow-submenu,
            .mediaflow-menu-item.has-submenu:hover > .mediaflow-submenu {
                display: block;
            }
        `;
        document.head.appendChild(style);
    }

    /**
     * Show Menu
     * @param {Event} event - Mouse event
     * @param {Array} items - Menu structure
     * [
     *   { label: 'Copy', action: () => {} },
     *   { type: 'divider' },
     *   { label: 'Submenu', children: [...] }
     * ]
     */
    show(event, items) {
        event.preventDefault();
        event.stopPropagation();
        this.hide();

        const menuDetails = this.createMenuElement(items);
        this.activeMenu = menuDetails;

        document.body.appendChild(this.activeMenu);

        // Positioning
        const { clientX: x, clientY: y } = event;
        const rect = this.activeMenu.getBoundingClientRect();

        // Boundary Check
        let finalX = x;
        let finalY = y;

        if (x + rect.width > window.innerWidth) finalX = x - rect.width;
        if (y + rect.height > window.innerHeight) finalY = y - rect.height;

        this.activeMenu.style.left = `${finalX}px`;
        this.activeMenu.style.top = `${finalY}px`;
    }

    createMenuElement(items) {
        const menu = document.createElement('div');
        menu.className = 'mediaflow-context-menu';

        items.forEach(item => {
            if (item.type === 'divider') {
                const divider = document.createElement('div');
                divider.className = 'mediaflow-menu-divider';
                menu.appendChild(divider);
                return;
            }

            const el = document.createElement('div');
            el.className = 'mediaflow-menu-item';
            if (item.disabled) el.classList.add('disabled');

            // Label
            const label = document.createElement('span');
            label.textContent = item.label;
            el.appendChild(label);

            // Action or Submenu
            if (item.children && item.children.length > 0) {
                el.classList.add('has-submenu'); // For hover bridge

                const arrow = document.createElement('span');
                arrow.className = 'mediaflow-submenu-arrow';
                arrow.textContent = '▶';
                el.appendChild(arrow);

                // Create Submenu (Recursively)
                const submenu = this.createMenuElement(item.children);
                submenu.classList.add('mediaflow-context-menu', 'mediaflow-submenu');
                el.appendChild(submenu);
            } else if (item.action) {
                el.onclick = (e) => {
                    e.stopPropagation(); // Prevent bubbling
                    this.hide();
                    item.action();
                };
            }

            menu.appendChild(el);
        });

        return menu;
    }

    hide() {
        if (this.activeMenu) {
            this.activeMenu.remove();
            this.activeMenu = null;
        }
    }
}

window.ContextMenu = ContextMenu;
