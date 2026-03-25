// tracts.js – финальная стабильная версия (без setState внутри calculateAll)
const TractsModule = (function() {
    let unsubscribe = null;
    let currentModalCallback = null;
    let portManager = null;
    let isUpdating = false;

    // ... все функции createDevice, createSwitch, createMatrix, getDeviceDetail, renderDevicesInSegment, renderSinglePath, renderAllTracts, attachAllTractsEvents, attachDeviceEvents, updateModelSelect, addNewPath, setActivePath, showAllTracts, renderEmptyState, renderPathsList, escapeHtml остаются без изменений, как в предыдущем стабильном варианте.

    function calculateAll() {
        if (isUpdating) return;
        isUpdating = true;
        try {
            const state = AppState.getState();
            const settings = state.globalSettings;

            // Сброс портов
            for (let sw of state.projectSwitches) {
                if (sw.type === 'networkSwitch') {
                    for (let port of sw.ports) port.deviceId = null;
                }
            }

            // Подключение устройств (логика без setState)
            let devicesToConnect = [];
            state.paths.forEach(path => {
                devicesToConnect.push(...path.sourceDevices.filter(d => d.hasNetwork !== false));
                devicesToConnect.push(...path.sinkDevices.filter(d => d.hasNetwork !== false));
            });
            devicesToConnect.push(...state.projectSwitches.filter(s => s.type === 'matrix' && s.hasNetwork !== false));
            for (let dev of devicesToConnect) {
                const needConnect = dev.poeEnabled || dev.ethernet;
                dev.attachedSwitchId = null;
                dev.attachedPortNumber = null;
                if (needConnect) {
                    const requirePoE = dev.poeEnabled === true;
                    const result = portManager.findAvailableSwitch(dev, requirePoE);
                    if (!result) {
                        console.warn(`Не удалось подключить устройство ${dev.name}: нет свободных портов${requirePoE ? ' / PoE' : ''}`);
                    } else {
                        const { sw, portNumber } = result;
                        const port = sw.ports.find(p => p.number === portNumber);
                        if (port) port.deviceId = dev.id;
                        dev.attachedSwitchId = sw.id;
                        dev.attachedPortNumber = portNumber;
                    }
                }
            }

            // Расчёт битрейта, мощности и пр.
            let totalBitrate = 0, totalPoEBudget = 0, usedPoE = 0, mainsPower = 0, totalPowerAll = 0;
            for (let sw of state.projectSwitches) {
                totalPowerAll += sw.powerW || 0;
                mainsPower += sw.powerW || 0;
                if (sw.type === 'networkSwitch' && sw.poeBudget) totalPoEBudget += sw.poeBudget;
            }
            state.paths.forEach(path => {
                path.sourceDevices.forEach(dev => {
                    if (dev.type === 'source' || dev.type === 'tx') {
                        let bitrate = Utils.calcVideoBitrate(settings);
                        if (dev.type === 'tx') bitrate *= (dev.bitrateFactor || 0.8);
                        totalBitrate += bitrate * (dev.bitrateFactor || 1);
                    }
                    let power = dev.powerW || 0;
                    totalPowerAll += power;
                    if (dev.poe === true && dev.poeEnabled) usedPoE += dev.poePower || 0;
                    else mainsPower += power;
                });
                path.sinkDevices.forEach(dev => {
                    if (dev.type === 'rx') {
                        let bitrate = Utils.calcVideoBitrate(settings);
                        if (dev.usb) { const usbSpeeds = { '2.0': 480, '3.0': 5000, '3.1': 10000 }; bitrate += usbSpeeds[dev.usbVersion] || 0; }
                        totalBitrate += bitrate * (dev.bitrateFactor || 1);
                    }
                    let power = dev.powerW || 0;
                    totalPowerAll += power;
                    if (dev.poe === true && dev.poeEnabled) usedPoE += dev.poePower || 0;
                    else mainsPower += power;
                });
            });
            if (state.ledConfig.area > 0 && state.ledConfig.power > 0) {
                totalPowerAll += state.ledConfig.power;
                mainsPower += state.ledConfig.power;
            }

            let minBackplane = state.projectSwitches.length ? Math.min(...state.projectSwitches.map(s => s.backplane || 100)) * 1000 : 1000;
            let loadPercent = (totalBitrate / minBackplane) * 100;
            if (loadPercent > 100) loadPercent = 100;

            document.getElementById('sidebarTotalBitrate').innerText = totalBitrate.toFixed(0);
            document.getElementById('sidebarLoadPercent').innerText = loadPercent.toFixed(1) + '%';
            const stats = portManager.getStats();
            document.getElementById('sidebarPortsUsed').innerText = stats.usedPorts;
            document.getElementById('sidebarPortsTotal').innerText = stats.totalPorts;
            document.getElementById('sidebarPoEUsed').innerText = usedPoE;
            document.getElementById('sidebarPoETotal').innerText = totalPoEBudget;
            document.getElementById('sidebarTotalPower').innerText = totalPowerAll.toFixed(0);
            document.getElementById('sidebarTotalBTU').innerText = (totalPowerAll * 3.412).toFixed(0);
            document.getElementById('sidebarMulticastStatus').innerText = settings.multicast ? 'Вкл' : 'Выкл';
            document.getElementById('sidebarQoSStatus').innerText = settings.qos ? 'Вкл' : 'Выкл';

            // Отображение в зависимости от viewMode
            if (state.viewMode === 'single') {
                const activePath = state.paths.find(p => p.id === state.activePathId);
                if (activePath) {
                    renderSinglePath(activePath);
                } else {
                    renderEmptyState();
                }
            } else if (state.viewMode === 'all') {
                renderAllTracts();
            } else if (state.viewMode === 'led' || state.viewMode === 'sound' || state.viewMode === 'vc' || state.viewMode === 'ergo') {
                // другие модули сами управляют отображением
            } else {
                renderEmptyState();
            }
            renderPathsList();
        } finally {
            isUpdating = false;
        }
    }

    // Остальные функции (init, destroy и т.д.) без изменений, но важно, чтобы в init не вызывалось setState, кроме начального.
    function init() {
        portManager = new Utils.SimplePortManager();
        unsubscribe = AppState.subscribe((newState) => {
            portManager.setSwitches(newState.projectSwitches);
            calculateAll();
        });

        document.getElementById('addPathBtnSidebar').addEventListener('click', () => addNewPath());
        document.getElementById('showAllTractsBtn').addEventListener('click', () => showAllTracts());

        // Модальное окно добавления устройства
        const modal = document.getElementById('addDeviceModal');
        const modalAddBtn = document.getElementById('modalAddBtn');
        const modalCancelBtn = document.getElementById('modalCancelBtn');
        const deviceTypeSelect = document.getElementById('deviceTypeSelect');
        const deviceModelSelect = document.getElementById('deviceModelSelect');

        deviceTypeSelect.addEventListener('change', () => updateModelSelect(deviceTypeSelect.value));

        modalAddBtn.addEventListener('click', () => {
            if (!currentModalCallback) return;
            let type = deviceTypeSelect.value;
            let modelIndex = deviceModelSelect.selectedIndex;
            const state = AppState.getState();
            if (currentModalCallback.segment === 'switch') {
                if (type === 'matrix') {
                    let newMatrix = createMatrix(type, modelIndex);
                    if (newMatrix) {
                        state.projectSwitches.push(newMatrix);
                        Utils.updateAllShortNames(state);
                        AppState.setState(state);
                    }
                } else if (type === 'networkSwitch') {
                    let newSwitch = createSwitch(type, modelIndex);
                    if (newSwitch) {
                        state.projectSwitches.push(newSwitch);
                        Utils.updateAllShortNames(state);
                        AppState.setState(state);
                    }
                }
            } else {
                let path = state.paths.find(p => p.id === currentModalCallback.pathId);
                if (!path) return;
                let newDev = createDevice(type, modelIndex, currentModalCallback.pathId, currentModalCallback.segment);
                if (newDev) {
                    if (currentModalCallback.segment === 'source') path.sourceDevices.push(newDev);
                    else if (currentModalCallback.segment === 'sink') path.sinkDevices.push(newDev);
                    Utils.updateAllShortNames(state);
                    AppState.setState(state);
                }
            }
            modal.style.display = 'none';
            currentModalCallback = null;
        });

        modalCancelBtn.addEventListener('click', () => {
            modal.style.display = 'none';
            currentModalCallback = null;
        });
        window.addEventListener('click', e => { if (e.target === modal) modal.style.display = 'none'; });

        const initialState = AppState.getState();
        if (initialState.paths.length === 0) addNewPath();
        else setActivePath(initialState.paths[0].id);
        calculateAll();
    }

    function destroy() {
        if (unsubscribe) unsubscribe();
    }

    function escapeHtml(str) {
        if (str == null) return '';
        return String(str).replace(/[&<>]/g, function(m) {
            if (m === '&') return '&amp;';
            if (m === '<') return '&lt;';
            if (m === '>') return '&gt;';
            return m;
        });
    }

    return { init, destroy };
})();
