// logger.js
const LoggerModule = (function() {
    let unsubscribe = null;
    let networkMonitorInterval = null;
    const MAX_LOGS = 500;
    const PASSWORD = 'sputnik2025'; // пароль для доступа к логам

    function getSystemInfo() {
        const userAgent = navigator.userAgent;
        let os = 'Unknown';
        if (userAgent.indexOf('Win') !== -1) os = 'Windows';
        else if (userAgent.indexOf('Mac') !== -1) os = 'macOS';
        else if (userAgent.indexOf('Linux') !== -1) os = 'Linux';
        else if (userAgent.indexOf('Android') !== -1) os = 'Android';
        else if (userAgent.indexOf('iOS') !== -1) os = 'iOS';
        
        return {
            os: os,
            userAgent: userAgent,
            language: navigator.language,
            platform: navigator.platform,
            screen: `${window.screen.width}x${window.screen.height}`,
            timestamp: new Date().toISOString()
        };
    }

    async function getNetworkInfo() {
        const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
        let info = {
            online: navigator.onLine,
            type: connection ? connection.type : 'unknown',
            effectiveType: connection ? connection.effectiveType : 'unknown',
            downlink: connection ? connection.downlink : null,
            rtt: connection ? connection.rtt : null,
            timestamp: new Date().toISOString()
        };
        if (info.online && info.downlink === null) {
            try {
                const start = performance.now();
                await fetch('https://www.google.com/favicon.ico', { mode: 'no-cors' });
                const duration = (performance.now() - start) / 1000;
                const size = 14000;
                info.downlink = (size * 8) / duration / 1000000;
            } catch(e) {}
        }
        return info;
    }

    function saveLog(log) {
        let logs = getLogs();
        logs.unshift(log);
        if (logs.length > MAX_LOGS) logs.pop();
        localStorage.setItem('sputnik_logs', JSON.stringify(logs));
    }

    function getLogs() {
        const logs = localStorage.getItem('sputnik_logs');
        return logs ? JSON.parse(logs) : [];
    }

    function clearLogs() {
        localStorage.removeItem('sputnik_logs');
        alert('Логи очищены');
        if (window.displayLogs) window.displayLogs();
    }

    function log(message, type = 'info', data = null) {
        const logEntry = {
            timestamp: new Date().toISOString(),
            type: type,
            message: message,
            data: data
        };
        saveLog(logEntry);
        if (type === 'error') console.error(message, data);
        else if (type === 'warn') console.warn(message, data);
        else console.log(message, data);
    }

    function startNetworkMonitoring() {
        getNetworkInfo().then(info => {
            log(`Сеть: ${info.online ? 'онлайн' : 'офлайн'}, тип: ${info.type}, скорость: ${info.downlink ? info.downlink.toFixed(2) + ' Мбит/с' : 'неизвестно'}`, 'info', info);
        });
        
        window.addEventListener('online', () => {
            getNetworkInfo().then(info => {
                log('Соединение восстановлено', 'info', info);
            });
        });
        window.addEventListener('offline', () => {
            log('Соединение потеряно', 'warn');
        });
        
        if (networkMonitorInterval) clearInterval(networkMonitorInterval);
        networkMonitorInterval = setInterval(() => {
            if (navigator.onLine) {
                getNetworkInfo().then(info => {
                    if (info.downlink !== null) {
                        log(`Текущая скорость: ${info.downlink.toFixed(2)} Мбит/с, RTT: ${info.rtt} мс`, 'info', info);
                    } else {
                        log(`Сеть: ${info.online ? 'онлайн' : 'офлайн'}, тип: ${info.type}`, 'info', info);
                    }
                });
            }
        }, 60000);
    }

    function captureEvents() {
        document.body.addEventListener('click', (e) => {
            const target = e.target.closest('button, .mode-btn, .add-device-btn, .rename-path, .delete-path, .path-name, .section-header, .ergo-tab');
            if (target) {
                let action = '';
                if (target.classList.contains('mode-btn')) action = `нажата кнопка режима: ${target.dataset.mode}`;
                else if (target.classList.contains('add-device-btn')) action = `нажата кнопка добавления устройства в тракт ${target.dataset.pathId} сегмент ${target.dataset.segment}`;
                else if (target.classList.contains('rename-path')) action = `нажата кнопка переименования тракта ${target.dataset.pathId}`;
                else if (target.classList.contains('delete-path')) action = `нажата кнопка удаления тракта ${target.dataset.pathId}`;
                else if (target.classList.contains('path-name')) action = `выбран тракт ${target.dataset.pathId}`;
                else if (target.classList.contains('section-header')) action = `аккордеон ${target.dataset.section} ${target.classList.contains('collapsed') ? 'закрыт' : 'открыт'}`;
                else if (target.classList.contains('ergo-tab')) action = `переключена вкладка эргономики на ${target.dataset.tab}`;
                else if (target.id === 'addPathBtnSidebar') action = 'создание нового тракта';
                else if (target.id === 'showAllTractsBtn') action = 'показать все тракты';
                else if (target.id === 'saveToBrowserBtn') action = 'сохранить проект';
                else if (target.id === 'exportJsonBtn') action = 'экспорт JSON';
                else if (target.id === 'importJsonBtn') action = 'импорт JSON';
                else if (target.id === 'printReportBtnSidebar') action = 'печать отчёта';
                else if (target.id === 'wikiBtnSidebar') action = 'открыть Wiki';
                else if (target.id === 'resetProjectBtn') action = 'сброс проекта';
                else if (target.id === 'showErgoCalcBtn') action = 'показать калькулятор эргономики';
                else if (target.id === 'closeErgoBtn') action = 'закрыть калькулятор эргономики';
                else action = `клик по элементу: ${target.tagName} ${target.className}`;
                log(action, 'action', { id: target.id, classList: target.classList.toString() });
            }
        });
        
        document.body.addEventListener('change', (e) => {
            const target = e.target;
            if (target.matches('select, input:not([type="checkbox"]), input[type="checkbox"]')) {
                const value = target.type === 'checkbox' ? target.checked : target.value;
                log(`Изменение поля ${target.id || target.name}: ${value}`, 'action', { id: target.id, value: value });
            }
        });
        document.body.addEventListener('input', (e) => {
            const target = e.target;
            if (target.matches('input[type="range"], input[type="number"], input[type="text"]')) {
                log(`Ввод в поле ${target.id}: ${target.value}`, 'action', { id: target.id, value: target.value });
            }
        });
    }

    // Функция для экспорта логов в JSON
    function exportLogs() {
        const logs = getLogs();
        const dataStr = JSON.stringify(logs, null, 2);
        const blob = new Blob([dataStr], {type: 'application/json'});
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `sputnik_logs_${new Date().toISOString().slice(0,19)}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        alert('Логи экспортированы');
    }

    // Функция для получения статистики по логам
    function getStats(logs) {
        const stats = {
            total: logs.length,
            byType: { info: 0, action: 0, warn: 0, error: 0 },
            actions: {},
            networkChanges: 0,
            firstTimestamp: logs[logs.length-1]?.timestamp,
            lastTimestamp: logs[0]?.timestamp
        };
        logs.forEach(log => {
            stats.byType[log.type] = (stats.byType[log.type] || 0) + 1;
            if (log.type === 'action' && log.message) {
                const key = log.message;
                stats.actions[key] = (stats.actions[key] || 0) + 1;
            }
            if (log.message.includes('Соединение') || log.message.includes('скорость')) {
                stats.networkChanges++;
            }
        });
        return stats;
    }

    // Защищённый показ логов с паролем
    function showLogsModal() {
        const password = prompt('Введите пароль для просмотра журнала событий:');
        if (password !== PASSWORD) {
            alert('Неверный пароль');
            return;
        }
        renderLogsModal();
    }

    function renderLogsModal(filterType = null) {
        let logs = getLogs();
        if (filterType && filterType !== 'all') {
            logs = logs.filter(log => log.type === filterType);
        }
        const stats = getStats(logs);
        
        const modal = document.createElement('div');
        modal.className = 'modal';
        modal.style.display = 'flex';
        modal.innerHTML = `
            <div class="modal-content" style="max-width: 900px; max-height: 80vh; overflow: auto;">
                <span class="modal-close" style="float:right; cursor:pointer;">&times;</span>
                <h3>Журнал событий</h3>
                <div style="margin-bottom: 10px; display: flex; gap: 8px; flex-wrap: wrap;">
                    <button id="clearLogsBtn" class="btn-secondary">Очистить логи</button>
                    <button id="exportLogsBtn" class="btn-secondary">Экспорт логов</button>
                    <button id="statsBtn" class="btn-secondary">Статистика</button>
                    <select id="filterTypeSelect" style="padding: 4px 8px;">
                        <option value="all">Все типы</option>
                        <option value="info">Info</option>
                        <option value="action">Action</option>
                        <option value="warn">Warn</option>
                        <option value="error">Error</option>
                    </select>
                </div>
                <div id="statsPanel" style="display: none; background: var(--card-bg); padding: 10px; border-radius: 8px; margin-bottom: 10px;"></div>
                <div id="logsList" style="font-family: monospace; font-size: 12px; max-height: 55vh; overflow-y: auto;">
                    ${logs.map(log => `<div style="border-bottom:1px solid #ccc; padding:4px;">
                        <span style="color:#666;">${log.timestamp}</span> 
                        <strong style="color:${log.type==='error'?'red':log.type==='warn'?'orange':'green'}">[${log.type}]</strong> 
                        ${escapeHtml(log.message)}
                        ${log.data ? `<span style="color:#888;"> ${escapeHtml(JSON.stringify(log.data))}</span>` : ''}
                    </div>`).join('')}
                </div>
                <div class="modal-buttons" style="margin-top: 10px;">
                    <button id="closeLogsBtn" class="btn-primary">Закрыть</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
        
        const closeModal = () => modal.remove();
        modal.querySelector('.modal-close').addEventListener('click', closeModal);
        modal.querySelector('#closeLogsBtn').addEventListener('click', closeModal);
        
        modal.querySelector('#clearLogsBtn').addEventListener('click', () => {
            if (confirm('Очистить все логи?')) {
                clearLogs();
                renderLogsModal(filterType);
            }
        });
        
        modal.querySelector('#exportLogsBtn').addEventListener('click', exportLogs);
        
        const statsBtn = modal.querySelector('#statsBtn');
        const statsPanel = modal.querySelector('#statsPanel');
        statsBtn.addEventListener('click', () => {
            if (statsPanel.style.display === 'none') {
                statsPanel.innerHTML = `
                    <strong>Статистика:</strong><br>
                    Всего записей: ${stats.total}<br>
                    По типам: Info: ${stats.byType.info}, Action: ${stats.byType.action}, Warn: ${stats.byType.warn}, Error: ${stats.byType.error}<br>
                    Событий сети: ${stats.networkChanges}<br>
                    Период: ${stats.firstTimestamp ? stats.firstTimestamp.slice(0,19) : '—'} – ${stats.lastTimestamp ? stats.lastTimestamp.slice(0,19) : '—'}<br>
                    <details><summary>Топ действий</summary>
                    ${Object.entries(stats.actions).sort((a,b)=>b[1]-a[1]).slice(0,10).map(([k,v])=>`${k}: ${v}`).join('<br>')}
                    </details>
                `;
                statsPanel.style.display = 'block';
            } else {
                statsPanel.style.display = 'none';
            }
        });
        
        const filterSelect = modal.querySelector('#filterTypeSelect');
        filterSelect.value = filterType || 'all';
        filterSelect.addEventListener('change', () => {
            const newFilter = filterSelect.value === 'all' ? null : filterSelect.value;
            renderLogsModal(newFilter);
        });
        
        modal.addEventListener('click', (e) => {
            if (e.target === modal) closeModal();
        });
        
        window.displayLogs = () => {
            renderLogsModal(filterType);
        };
    }

    function init() {
        const sysInfo = getSystemInfo();
        log(`Приложение запущено. ОС: ${sysInfo.os}, язык: ${sysInfo.language}, экран: ${sysInfo.screen}`, 'info', sysInfo);
        
        startNetworkMonitoring();
        captureEvents();
        
        unsubscribe = AppState.subscribe((newState) => {
            log('Состояние обновлено', 'info', { viewMode: newState.viewMode, pathsCount: newState.paths.length });
        });
        
        const manageContent = document.getElementById('manageContent');
        if (manageContent && !document.getElementById('showLogsBtn')) {
            const btn = document.createElement('button');
            btn.id = 'showLogsBtn';
            btn.className = 'btn-secondary';
            btn.innerHTML = '<i class="fas fa-history"></i><span> Показать логи</span>';
            btn.addEventListener('click', showLogsModal);
            const buttonsContainer = manageContent.querySelector('.manage-buttons');
            if (buttonsContainer) {
                buttonsContainer.appendChild(btn);
            } else {
                manageContent.appendChild(btn);
            }
        }
    }

    function destroy() {
        if (unsubscribe) unsubscribe();
        if (networkMonitorInterval) clearInterval(networkMonitorInterval);
    }

    function escapeHtml(str) {
        if (!str) return '';
        return String(str).replace(/[&<>]/g, function(m) {
            if (m === '&') return '&amp;';
            if (m === '<') return '&lt;';
            if (m === '>') return '&gt;';
            return m;
        });
    }

    return { init, destroy, getLogs, clearLogs, showLogsModal };
})();
