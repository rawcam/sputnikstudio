// accordion.js
const Accordion = (function() {
    function init() {
        const sidebar = document.querySelector('.sidebar');
        if (!sidebar) return;

        sidebar.addEventListener('click', (e) => {
            const header = e.target.closest('.section-header');
            if (!header) return;

            const sectionId = header.getAttribute('data-section');
            if (!sectionId) return;

            const content = document.getElementById(`${sectionId}Content`);
            if (!content) return;

            const isCollapsed = content.classList.toggle('collapsed');
            header.classList.toggle('collapsed', isCollapsed);
            if (isCollapsed) {
                header.classList.remove('active');
            } else {
                header.classList.add('active');
            }

            localStorage.setItem(`section_${sectionId}_collapsed`, isCollapsed);
        });

        const sections = ['video', 'network', 'led', 'sound', 'vc', 'paths', 'networkStats', 'powerStats', 'manage', 'ergo'];
        sections.forEach(sectionId => {
            const header = document.querySelector(`.section-header[data-section="${sectionId}"]`);
            const content = document.getElementById(`${sectionId}Content`);
            if (!header || !content) return;

            const isCollapsed = localStorage.getItem(`section_${sectionId}_collapsed`) === 'true';
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
