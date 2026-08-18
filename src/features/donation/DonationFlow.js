/**
 * DonationFlow — 捐赠页二维码自动生成
 * 页面按需加载（pageLoader），此脚本常驻并在 #page-donation 出现时初始化。
 * 二维码内容取自卡片 href，因此更换收款链接时只需改一处。
 */
(function () {
    function init() {
        const page = document.getElementById('page-donation');
        if (!page || page.dataset.donationInit) return;
        page.dataset.donationInit = '1';

        const cards = page.querySelectorAll('.donation-card[data-qr]');
        if (!cards.length) return;

        cards.forEach((card) => {
            const img = card.querySelector('img[data-qr-img]');
            const href = card.getAttribute('href');
            if (!img || !href) return;

            card.addEventListener('click', (event) => {
                if (window.mediaflow?.shell?.openExternal) {
                    event.preventDefault();
                    window.mediaflow.shell.openExternal(href);
                }
            });

            if (!window.mediaflow?.app?.generateQr) return;

            window.mediaflow.app.generateQr(href)
                .then((res) => {
                    if (res && res.success && res.dataUrl) {
                        img.src = res.dataUrl;
                        img.classList.add('loaded');
                    }
                })
                .catch(() => {
                    /* 二维码生成失败时保留占位，不影响点击捐款 */
                });
        });
    }

    if (document.getElementById('page-donation')) {
        init();
    } else if (typeof MutationObserver !== 'undefined') {
        const observer = new MutationObserver(() => {
            if (document.getElementById('page-donation')) {
                init();
                observer.disconnect();
            }
        });
        observer.observe(document.body, { childList: true, subtree: true });
    }

    window.DonationFlow = { init };
})();
