// tracts.js
const TractsModule = (function() {
    let unsubscribe = null;
    let currentSegment = null; // для модального окна добавления устройства

    // Элементы DOM
    const sidebarPathsList = document.getElementById('sidebarPathsList');
    const activePathContainer = document.getElementById('activePathContainer');
    const allTractsContainer = document.getElementById('allTractsContainer');

    // Вспомогательные функции
    function escapeHtml(str) {
        return str.replace(/[&<>]/g, function(m) {
            if (m === '&') return '&amp;';
            if (m === '<') return '&lt;';
            if (m === '>') return '&gt;';
            return m;
        });
    }

    // Генерация имени устройства (упрощённо)
    function generateDeviceName(baseName, type) {
        const state = AppState.getState();
        let maxNum = 0;
        const regex = new RegExp(`^${baseName} #(\\d+)$`);
        state.paths.forEach(path => {
            [...path.sourceDevices, ...path.sinkDevices].forEach(dev => {
                const match = dev.name.match(regex);
                if (match) {
                    const num = parseInt(match[1], 10);
                    if (num > maxNum) maxNum = num;
                }
            });
        });
        return `${baseName} #${maxNum + 1}`;
    }

    // Получение короткого имени (пока заглушка)
    function getShortName(dev) {
        return dev.shortPrefix + (dev.id % 100); // временно
    }

    // Обновление всех коротких имён (заглушка)
    function updateAllShortNames() {
        const state = AppState.getState();
        const allDevices = [];
        state.paths.forEach(p => allDevices.push(...p.sourceDevices, ...p.sinkDevices));
        allDevices.push(...state.projectSwitches);
        for (let dev of allDevices) {
            dev.shortName = getShortName(dev);
        }
    }

    // Получение детальной информации об устройстве для отображения
    function getDeviceDetail(dev) {
        let parts = [];
        if (dev.type === 'source') parts.push(`Зад: ${dev.latency} мс`);
        if (dev.type === 'tx' || dev.type === 'rx') {
            let usbStr = dev.usb ? `USB ${dev.usbVersion}` : 'USB нет';
            parts.push(`Зад: ${dev.latency} мс, ${usbStr}`);
        }
        if (dev.type === 'matrix') parts.push(`Вх/вых: ${dev.inputs}/${dev.outputs}, зад: ${dev.latencyIn+dev.latencyOut} мс`);
        if (dev.type === 'networkSwitch') parts.push(`Ком: ${dev.switchingLatency} мс, портов: ${dev.ports.length}`);
        if (!parts.length) parts.push(`Зад: ${dev.latency} мс`);
        if (dev.poeEnabled) parts.push(`PoE (${dev.poePower}W)`);
        else if (dev.ethernet) parts.push(`Ethernet`);
        return parts.join(', ');
    }

    // Рендеринг устройств в сегменте
    function renderDevicesInSegment(devices, forceCollapsed = false) {
        let html = '';
        devices.forEach(dev => {
            const isExpanded = !forceCollapsed && dev.expanded !== false;
            const icon = dev.icon || 'fa-question-circle';
            const shortName = dev.shortName || dev.shortPrefix + '?';
            const displayName = isExpanded ? dev.name : shortName;
            let expandedHtml = '';
            if (isExpanded) {
                // Минимальные элементы управления (позже добавим подробные)
                expandedHtml = `
                    <div class="device-info">
                        <div class="device-name">${escapeHtml(displayName)}</div>
                        <div class="device-detail">${escapeHtml(getDeviceDetail(dev))}</div>
                    </div>
                    <button class="device-remove" data-device-id="${dev.id}"><i class="fas fa-times"></i></button>
                    <div class="device-bottom-controls">
                        <div class="power-control-wrapper"><i class="fas fa-plug"></i><input type="number" class="power-input mains-power-input" data-device-id="${dev.id}" value="${dev.powerW||0}" step="1" min="0" style="width:55px;"> Вт</div>
                    </div>
                `;
            }
            let collapsedHtml = `
                <div class="device-icon"><i class="fas ${icon}"></i></div>
                <div class="device-info"><div class="device-name">${escapeHtml(shortName)}</div></div>
                <button class="device-remove" data-device-id="${dev.id}" style="position:static;"><i class="fas fa-times"></i></button>
            `;
            html += `<div class="device-item ${isExpanded ? 'expanded' : 'collapsed'}" data-device-id="${dev.id}">
                ${isExpanded ? expandedHtml : collapsedHtml}
                <button class="collapse-device-btn" data-device-id="${dev.id}" title="${isExpanded ? 'Свернуть' : 'Развернуть'}"><i class="fas ${isExpanded ? 'fa-compress' : 'fa-expand'}"></i></button>
            </div>`;
        });
        return html;
    }

    // Расчёт задержки для одного тракта (упрощённо)
    function calculatePathLatency(path, globalSettings) {
        const codecFactor = 1; // пока заглушка
        let delay = 0;
        path.sourceDevices.forEach(dev => {
            let d = dev.latency || 0;
            if (dev.usb) d += 0.5;
            if (dev.audioEmbed) d += 1.0;
            if (dev.type === 'tx' || dev.type === 'rx' || dev.type === 'ledProc') d *= codecFactor;
            delay += d;
        });
        const state = AppState.getState();
        state.projectSwitches.forEach(sw => {
            if (sw.switchingLatency) delay += sw.switchingLatency;
            if (sw.latencyIn) delay += sw.latencyIn;
            if (sw.latencyOut) delay += sw.latencyOut;
        });
        path.sinkDevices.forEach(dev => {
            let d = dev.latency || 0;
            if (dev.usb) d += 0.5;
            if (dev.audioEmbed) d += 1.0;
            if (dev.type === 'tx' || dev.type === 'rx' || dev.type === 'ledProc') d *= codecFactor;
            delay += d;
        });
        return delay;
    }

    // Рендеринг одного тракта в основной области
    function renderSinglePath(path) {
        if (!path) {
            activePathContainer.innerHTML = `<div class="empty-state"><i class="fas fa-road"></i><h3>Нет трактов</h3><p>Создайте новый тракт, чтобы начать работу</p><button class="btn-primary" id="emptyStateAddPath"><i class="fas fa-plus"></i> Новый тракт</button></div>`;
            const btn = document.getElementById('emptyStateAddPath');
            if (btn) btn.addEventListener('click', () => addNewPath());
            return;
        }
        const state = AppState.getState();
        const delay = calculatePathLatency(path, state.globalSettings);
        const fps = state.globalSettings.fps;
        const frames = delay / (1000 / fps);
        const html = `
            <div class="path-card" data-path-id="${path.id}">
                <div class="path-header">
                    <h3>${escapeHtml(path.name)}</h3>
                    <div class="path-latency" style="${delay > 100 ? 'background:#dc2626' : ''}">${delay.toFixed(2)} мс / ${frames.toFixed(2)} кадр.</div>
                </div>
                <div class="segments-row">
                    <div class="segment" data-path-id="${path.id}" data-segment="source">
                        <div class="segment-header"><span>Начало тракта</span><button class="add-device-btn" data-path-id="${path.id}" data-segment="source"><i class="fas fa-plus-circle"></i></button></div>
                        <div class="devices-container">${renderDevicesInSegment(path.sourceDevices)}</div>
                    </div>
                    <div class="segment" data-path-id="${path.id}" data-segment="switch">
                        <div class="segment-header"><span>Коммутация</span><button class="add-device-btn" data-path-id="${path.id}" data-segment="switch"><i class="fas fa-plus-circle"></i></button></div>
                        <div class="devices-container">${renderDevicesInSegment(state.projectSwitches)}</div>
                    </div>
                    <div class="segment" data-path-id="${path.id}" data-segment="sink">
                        <div class="segment-header"><span>Конец тракта</span><button class="add-device-btn" data-path-id="${path.id}" data-segment="sink"><i class="fas fa-plus-circle"></i></button></div>
                        <div class="devices-container">${renderDevicesInSegment(path.sinkDevices)}</div>
                    </div>
                </div>
            </div>
        `;
        activePathContainer.innerHTML = html;
        attachDeviceEvents();
    }

    // Рендеринг списка трактов в сайдбаре
    function renderPathsList() {
        const state = AppState.getState();
        let html = '';
        state.paths.forEach(path => {
            const isActive = (state.activePathId === path.id);
            html += `<li><div class="path-name ${isActive ? 'active' : ''}" data-path-id="${path.id}" title="${escapeHtml(path.name)}">${escapeHtml(path.name)}</div>
            <div class="path-actions"><button class="rename-path" data-path-id="${path.id}" title="Переименовать"><i class="fas fa-pencil-alt"></i></button>
            <button class="delete-path" data-path-id="${path.id}" title="Удалить"><i class="fas fa-trash-alt"></i></button></div></li>`;
        });
        sidebarPathsList.innerHTML = html;
        // Обработчики для списка
        document.querySelectorAll('.path-name').forEach(el => {
            el.addEventListener('click', e => {
                const id = parseInt(el.dataset.pathId);
                setActivePath(id);
            });
        });
        document.querySelectorAll('.rename-path').forEach(btn => {
            btn.addEventListener('click', e => {
                e.stopPropagation();
                const id = parseInt(btn.dataset.pathId);
                const path = state.paths.find(p => p.id === id);
                if (path) {
                    const newName = prompt('Новое название тракта:', path.name);
                    if (newName && newName.trim()) {
                        path.name = newName.trim();
                        AppState.setState({ paths: [...state.paths] }); // триггерим обновление
                    }
                }
            });
        });
        document.querySelectorAll('.delete-path').forEach(btn => {
            btn.addEventListener('click', e => {
                e.stopPropagation();
                const id = parseInt(btn.dataset.pathId);
                const path = state.paths.find(p => p.id === id);
                if (path && confirm(`Удалить тракт "${path.name}"?`)) {
                    // Удаляем все устройства из порт-менеджера (позже)
                    const newPaths = state.paths.filter(p => p.id !== id);
                    let newActiveId = state.activePathId;
                    if (newActiveId === id) {
                        newActiveId = newPaths.length ? newPaths[0].id : null;
                    }
                    AppState.setState({ paths: newPaths, activePathId: newActiveId });
                }
            });
        });
    }

    // Добавление нового тракта
    function addNewPath() {
        const state = AppState.getState();
        const newId = state.nextPathId;
        const newPath = {
            id: newId,
            name: `Тракт ${newId}`,
            sourceDevices: [],
            sinkDevices: []
        };
        const newPaths = [...state.paths, newPath];
        AppState.setState({
            paths: newPaths,
            nextPathId: newId + 1,
            activePathId: newId
        });
    }

    // Установка активного тракта
    function setActivePath(id) {
        AppState.setState({ activePathId: id });
        // Показываем активный тракт
        const state = AppState.getState();
        const path = state.paths.find(p => p.id === id);
        renderSinglePath(path);
    }

    // Обработчики событий внутри карточки тракта
    function attachDeviceEvents() {
        // Добавление устройства
        document.querySelectorAll('.add-device-btn').forEach(btn => {
            btn.addEventListener('click', e => {
                const pathId = parseInt(btn.dataset.pathId);
                const segment = btn.dataset.segment;
                currentSegment = { pathId, segment };
                // Показываем модальное окно (просто alert для теста)
                alert(`Добавление устройства в тракт ${pathId}, сегмент ${segment}. (Временно)`);
                // В будущем здесь будет открытие модального окна с выбором устройства
            });
        });
        // Удаление устройства
        document.querySelectorAll('.device-remove').forEach(btn => {
            btn.addEventListener('click', e => {
                e.stopPropagation();
                const deviceId = btn.dataset.deviceId;
                // Временно просто alert
                alert(`Удаление устройства ${deviceId} (временно)`);
                // В будущем удаление из соответствующего массива
            });
        });
        // Сворачивание/разворачивание устройства
        document.querySelectorAll('.collapse-device-btn').forEach(btn => {
            btn.addEventListener('click', e => {
                e.stopPropagation();
                const deviceId = btn.dataset.deviceId;
                // Временно alert
                alert(`Сворачивание/разворачивание устройства ${deviceId} (временно)`);
            });
        });
    }

    // Общая функция пересчёта статистики (заглушка)
    function calculateAll() {
        // Здесь будет полный расчёт битрейта, PoE и т.д.
        // Пока просто обновляем рендеринг активного тракта
        const state = AppState.getState();
        if (state.activePathId) {
            const path = state.paths.find(p => p.id === state.activePathId);
            if (path) renderSinglePath(path);
        }
    }

    // Инициализация модуля: подписка на изменения состояния
    function init() {
        unsubscribe = AppState.subscribe((newState) => {
            renderPathsList();
            if (newState.activePathId) {
                const path = newState.paths.find(p => p.id === newState.activePathId);
                renderSinglePath(path);
            } else {
                renderSinglePath(null);
            }
            calculateAll(); // для обновления статистики (пока заглушка)
        });

        // Обработчик кнопки "Новый тракт" в сайдбаре
        const addPathBtn = document.getElementById('addPathBtnSidebar');
        if (addPathBtn) addPathBtn.addEventListener('click', addNewPath);

        // Обработчик кнопки "Отобразить все тракты" (пока заглушка)
        const showAllBtn = document.getElementById('showAllTractsBtn');
        if (showAllBtn) showAllBtn.addEventListener('click', () => {
            alert('Отображение всех трактов пока в разработке');
        });

        // Первоначальный рендеринг
        const initialState = AppState.getState();
        renderPathsList();
        if (initialState.activePathId) {
            const path = initialState.paths.find(p => p.id === initialState.activePathId);
            renderSinglePath(path);
        } else {
            renderSinglePath(null);
        }
    }

    function destroy() {
        if (unsubscribe) unsubscribe();
    }

    return { init, destroy };
})();
