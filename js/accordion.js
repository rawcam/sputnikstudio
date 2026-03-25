// accordion.js
const Accordion = (function() {
    function init() {
        const sidebar = document.querySelector('.sidebar');
        if (!sidebar) return;

        sidebar.addEventListener('click', (e) => {
            const header = e.target.closest('.section-header');
            if (!header) return;

            const contentId = header.getAttribute('data-section');
            if (!contentId) return;

            const content = document.getElementById(`${contentId}Content`);
            if (!content) return;

            const isCollapsed = content.classList.toggle('collapsed');
            header.classList.toggle('collapsed', isCollapsed);
            if (isCollapsed) {
                header.classList.remove('active');
            } else {
                header.classList.add('active');
            }

            localStorage.setItem(`section_${contentId}_collapsed`, isCollapsed);
        });

        const sections = ['video', 'network', 'led', 'sound', 'vc', 'paths', 'networkStats', 'powerStats', 'manage', 'ergo'];
        sections.forEach(sectionId => {
            const header = document.querySelector(`.section-header[data-section="${sectionId}"]`);
            const content = document.getElementById(`${sectionId}Content`);
            if (!header || !content) return;

            // По умолчанию все секции закрыты, если нет сохранённого состояния
            let isCollapsed = localStorage.getItem(`section_${sectionId}_collapsed`);
            if (isCollapsed === null) {
                isCollapsed = true; // закрыто по умолчанию
            } else {
                isCollapsed = (isCollapsed === 'true');
            }

            if (isCollapsed) {
                content.classList.add('collapsed');
                header.classList.add('collapsed');
                header.classList.remove('active');
            } else {
                header.classList.add('active');
                content.classList.remove('collapsed');
                header.classList.remove('collapsed');
            }
        });
    }

    return { init };
})();
