// power.js – расширенная версия с кнопкой закрытия
const PowerModule = (function() {
    let unsubscribe = null;
    let previousViewMode = 'single';

    // Стандартные мощности кондиционеров в BTU/ч
    const AC_BTU_OPTIONS = [9000, 12000, 18000, 24000, 30000, 36000, 48000, 60000];
    const AC_BTU_TO_W = 0.293; // 1 BTU/ч ≈ 0.293 Вт
    const DEFAULT_UPS_EFFICIENCY = { online: 0.92, line_interactive: 0.95 };
    const DEFAULT_BATTERY_VOLTAGE = 12; // Вольт
    const DEFAULT_BATTERY_CAPACITY_FACTOR = 0.8; // коэффициент разряда (для AGM)
    const DEFAULT_INRUSH_FACTOR = 1.2; // учёт пусковых токов (20% запаса)

    // Хранилище настроек пользователя
    let userSettings = {
        upsType: 'online',
        batteryVoltage: 12,
        batteryChemistry: 'agm', // agm, gel, lifepo4
        inrushFactor: 1.2,
        roomArea: 0,
        roomHeight: 3,
        roomType: 'office'
    };

    // Загрузка сохранённых настроек из localStorage
    function loadSettings() {
        const saved = localStorage.getItem('power_module_settings');
        if (saved) {
            try {
                const parsed = JSON.parse(saved);
                Object.assign(userSettings, parsed);
            } catch(e) {}
        }
    }

    // Сохранение настроек
    function saveSettings() {
        localStorage.setItem('power_module_settings', JSON.stringify(userSettings));
    }

    // Расчёт ИБП
    function calculateUPS(totalPowerWatts, backupHours) {
        const efficiency = userSettings.upsType === 'online' ? DEFAULT_UPS_EFFICIENCY.online : DEFAULT_UPS_EFFICIENCY.line_interactive;
        const safetyMargin = userSettings.inrushFactor; // учёт пусковых токов
        const powerFactor = 0.7; // коэффициент мощности (можно вынести в настройки)
        // Полная мощность (ВА) с учётом КПД и запаса
        const va = totalPowerWatts / powerFactor * safetyMargin / efficiency;
        // Энергия, которую должны обеспечить батареи (Вт·ч)
        const batteryWh = totalPowerWatts * backupHours * safetyMargin / efficiency;
        // Ёмкость батарей в А·ч (с учётом напряжения и коэффициента разряда)
        let capacityFactor = 0.8; // по умолчанию для AGM
        if (userSettings.batteryChemistry === 'gel') capacityFactor = 0.85;
        if (userSettings.batteryChemistry === 'lifepo4') capacityFactor = 0.95;
        const batteryAh = batteryWh / userSettings.batteryVoltage / capacityFactor;

        let recommendedVA = Math.ceil(va / 100) * 100;
        if (recommendedVA < 500) recommendedVA = 500;
        if (recommendedVA > 10000) recommendedVA = Math.ceil(recommendedVA / 1000) * 1000;
        return {
            recommendedVA: recommendedVA,
            batteryWh: Math.ceil(batteryWh),
            batteryAh: Math.ceil(batteryAh * 10) / 10,
            efficiency: (efficiency * 100).toFixed(1),
            inrushFactor: safetyMargin
        };
    }

    // Подбор кондиционера по площади помещения и тепловыделению оборудования
    function recommendAC(totalBTU, roomArea, roomHeight, roomType) {
        // Тепловая нагрузка от помещения (примерные значения)
        let areaLoad = 0;
        if (roomType === 'office') areaLoad = 100;      // 100 Вт/м²
        else if (roomType === 'server') areaLoad = 300; // 300 Вт/м²
        else if (roomType === 'retail') areaLoad = 150; // 150 Вт/м²
        const roomVolume = roomArea * roomHeight;
        const roomBTU = (areaLoad * roomArea) / AC_BTU_TO_W; // перевод в BTU/ч
        const totalLoadBTU = totalBTU + roomBTU;
        // Подбор ближайшего стандартного размера
        if (totalLoadBTU <= AC_BTU_OPTIONS[0]) return AC_BTU_OPTIONS[0];
        for (let i = 0; i < AC_BTU_OPTIONS.length; i++) {
            if (AC_BTU_OPTIONS[i] >= totalLoadBTU) return AC_BTU_OPTIONS[i];
        }
        return AC_BTU_OPTIONS[AC_BTU_OPTIONS.length - 1];
    }

    function render() {
        const totalPowerWatts = parseFloat(document.getElementById('sidebarTotalPower')?.innerText) || 0;
        const totalBTU = parseFloat(document.getElementById('sidebarTotalBTU')?.innerText) || 0;
        const container = document.getElementById('powerCalculatorContainer');
        if (!container) return;

        let backupHours = parseFloat(localStorage.getItem('power_backup_hours')) || 1;
        const upsResult = calculateUPS(totalPowerWatts, backupHours);
        const roomArea = userSettings.roomArea || 0;
        const roomHeight = userSettings.roomHeight || 3;
        const roomType = userSettings.roomType || 'office';
        const recommendedAC = recommendAC(totalBTU, roomArea, roomHeight, roomType);

        container.innerHTML = `
            <div class="calc-card">
                <div style="display: flex; justify-content: flex-end; margin-bottom: 10px;">
                    <button class="btn-secondary" id="closePowerBtn"><i class="fas fa-times"></i> Закрыть калькулятор</button>
                </div>
                <h3><i class="fas fa-battery-full"></i> Подбор ИБП</h3>
                <div class="setting">
                    <label>Время резервирования (часы):</label>
                    <input type="number" id="backupHoursInput" value="${backupHours}" step="0.5" min="0.5" style="width:80px;">
                </div>
                <div class="setting">
                    <label>Тип ИБП:</label>
                    <select id="upsTypeSelect">
                        <option value="online" ${userSettings.upsType === 'online' ? 'selected' : ''}>On‑line (КПД ~92%)</option>
                        <option value="line_interactive" ${userSettings.upsType === 'line_interactive' ? 'selected' : ''}>Line‑interactive (КПД ~95%)</option>
                    </select>
                </div>
                <div class="setting">
                    <label>Коэффициент запаса (пусковые токи):</label>
                    <input type="number" id="inrushFactorInput" value="${userSettings.inrushFactor}" step="0.05" min="1.0" max="2.0" style="width:70px;">
                </div>
                <details style="margin: 10px 0;">
                    <summary style="cursor: pointer; color: var(--accent);">Настройки батарей</summary>
                    <div class="setting">
                        <label>Напряжение батарей (В):</label>
                        <select id="batteryVoltageSelect">
                            <option value="12" ${userSettings.batteryVoltage === 12 ? 'selected' : ''}>12 В</option>
                            <option value="24" ${userSettings.batteryVoltage === 24 ? 'selected' : ''}>24 В</option>
                            <option value="48" ${userSettings.batteryVoltage === 48 ? 'selected' : ''}>48 В</option>
                        </select>
                    </div>
                    <div class="setting">
                        <label>Тип батарей:</label>
                        <select id="batteryChemistrySelect">
                            <option value="agm" ${userSettings.batteryChemistry === 'agm' ? 'selected' : ''}>AGM (коэфф. разряда 0.8)</option>
                            <option value="gel" ${userSettings.batteryChemistry === 'gel' ? 'selected' : ''}>GEL (коэфф. разряда 0.85)</option>
                            <option value="lifepo4" ${userSettings.batteryChemistry === 'lifepo4' ? 'selected' : ''}>LiFePO₄ (коэфф. разряда 0.95)</option>
                        </select>
                    </div>
                </details>
                <div class="result-grid">
                    <div class="result-item">
                        <div class="result-label">Рекомендуемая мощность ИБП</div>
                        <div class="result-value">${upsResult.recommendedVA}</div>
                        <div>ВА</div>
                    </div>
                    <div class="result-item">
                        <div class="result-label">Ёмкость батарей (прибл.)</div>
                        <div class="result-value">${upsResult.batteryAh}</div>
                        <div>А·ч</div>
                    </div>
                    <div class="result-item">
                        <div class="result-label">Энергия батарей</div>
                        <div class="result-value">${upsResult.batteryWh}</div>
                        <div>Вт·ч</div>
                    </div>
                </div>
                <div class="ergo-info">
                    Расчёт приблизительный. Учтён КПД: ${upsResult.efficiency}%, коэффициент мощности 0.7, запас на пусковые токи: ${upsResult.inrushFactor.toFixed(2)}.
                </div>
            </div>
            <div class="calc-card">
                <h3><i class="fas fa-snowflake"></i> Рекомендация по кондиционеру</h3>
                <div class="widget-item">
                    <span class="widget-label">Тепловыделение оборудования (BTU/ч):</span>
                    <span class="widget-value">${totalBTU}</span>
                </div>
                <details style="margin: 10px 0;">
                    <summary style="cursor: pointer; color: var(--accent);">Параметры помещения</summary>
                    <div class="setting">
                        <label>Площадь помещения (м²):</label>
                        <input type="number" id="roomAreaInput" value="${roomArea}" step="1" min="0" style="width:80px;">
                    </div>
                    <div class="setting">
                        <label>Высота потолков (м):</label>
                        <input type="number" id="roomHeightInput" value="${roomHeight}" step="0.5" min="2" style="width:80px;">
                    </div>
                    <div class="setting">
                        <label>Тип помещения:</label>
                        <select id="roomTypeSelect">
                            <option value="office" ${roomType === 'office' ? 'selected' : ''}>Офис (100 Вт/м²)</option>
                            <option value="server" ${roomType === 'server' ? 'selected' : ''}>Серверная (300 Вт/м²)</option>
                            <option value="retail" ${roomType === 'retail' ? 'selected' : ''}>Торговый зал (150 Вт/м²)</option>
                        </select>
                    </div>
                </details>
                <div class="result-grid">
                    <div class="result-item">
                        <div class="result-label">Рекомендуемая мощность кондиционера</div>
                        <div class="result-value">${recommendedAC}</div>
                        <div>BTU/ч</div>
                    </div>
                </div>
                <div class="ergo-info">
                    Учтена тепловая нагрузка помещения (${roomType === 'office' ? '100' : roomType === 'server' ? '300' : '150'} Вт/м²).<br>
                    Типовые мощности: ${AC_BTU_OPTIONS.join(', ')} BTU/ч.
                </div>
            </div>
        `;

        // Обработчик закрытия
        const closeBtn = document.getElementById('closePowerBtn');
        if (closeBtn) {
            closeBtn.addEventListener('click', closePowerCalculator);
        }

        // Обработчики для ИБП
        const backupInput = document.getElementById('backupHoursInput');
        if (backupInput) backupInput.addEventListener('change', () => {
            localStorage.setItem('power_backup_hours', parseFloat(backupInput.value) || 1);
            render();
        });
        const upsTypeSelect = document.getElementById('upsTypeSelect');
        if (upsTypeSelect) upsTypeSelect.addEventListener('change', () => {
            userSettings.upsType = upsTypeSelect.value;
            saveSettings();
            render();
        });
        const inrushFactorInput = document.getElementById('inrushFactorInput');
        if (inrushFactorInput) inrushFactorInput.addEventListener('change', () => {
            userSettings.inrushFactor = parseFloat(inrushFactorInput.value) || 1.2;
            saveSettings();
            render();
        });
        const batteryVoltageSelect = document.getElementById('batteryVoltageSelect');
        if (batteryVoltageSelect) batteryVoltageSelect.addEventListener('change', () => {
            userSettings.batteryVoltage = parseInt(batteryVoltageSelect.value);
            saveSettings();
            render();
        });
        const batteryChemistrySelect = document.getElementById('batteryChemistrySelect');
        if (batteryChemistrySelect) batteryChemistrySelect.addEventListener('change', () => {
            userSettings.batteryChemistry = batteryChemistrySelect.value;
            saveSettings();
            render();
        });

        // Обработчики для кондиционера
        const roomAreaInput = document.getElementById('roomAreaInput');
        if (roomAreaInput) roomAreaInput.addEventListener('change', () => {
            userSettings.roomArea = parseFloat(roomAreaInput.value) || 0;
            saveSettings();
            render();
        });
        const roomHeightInput = document.getElementById('roomHeightInput');
        if (roomHeightInput) roomHeightInput.addEventListener('change', () => {
            userSettings.roomHeight = parseFloat(roomHeightInput.value) || 3;
            saveSettings();
            render();
        });
        const roomTypeSelect = document.getElementById('roomTypeSelect');
        if (roomTypeSelect) roomTypeSelect.addEventListener('change', () => {
            userSettings.roomType = roomTypeSelect.value;
            saveSettings();
            render();
        });
    }

    function closePowerCalculator() {
        const state = AppState.getState();
        // Возвращаем предыдущий режим, который был до открытия калькулятора питания
        const lastMode = previousViewMode;
        if (lastMode === 'single') {
            const activePath = state.paths.find(p => p.id === state.activePathId);
            if (activePath) {
                state.viewMode = 'single';
                AppState.setState(state);
            } else if (state.paths.length) {
                state.viewMode = 'single';
                state.activePathId = state.paths[0].id;
                AppState.setState(state);
            } else {
                state.viewMode = 'single';
                AppState.setState(state);
            }
        } else if (lastMode === 'all') {
            state.viewMode = 'all';
            AppState.setState(state);
        } else {
            state.viewMode = 'single';
            AppState.setState(state);
        }
        // Скрываем контейнер
        document.getElementById('powerCalculatorContainer').style.display = 'none';
        // Восстанавливаем кнопку в сайдбаре
        const powerBtn = document.getElementById('showPowerCalcBtn');
        if (powerBtn) {
            powerBtn.classList.remove('btn-inactive');
            powerBtn.classList.add('btn-primary');
            powerBtn.innerHTML = '<i class="fas fa-calculator"></i> Калькулятор питания';
        }
    }

    function showPowerCalculator() {
        const state = AppState.getState();
        if (state.viewMode === 'power') return;
        // Сохраняем предыдущий режим
        previousViewMode = state.viewMode;
        state.viewMode = 'power';
        AppState.setState(state);

        document.getElementById('activePathContainer').style.display = 'none';
        document.getElementById('allTractsContainer').style.display = 'none';
        document.getElementById('ergoCalculatorContainer').style.display = 'none';
        document.getElementById('soundCalculatorContainer').style.display = 'none';
        document.getElementById('ledCalculatorContainer').style.display = 'none';
        document.getElementById('vcCalculatorContainer').style.display = 'none';
        const powerContainer = document.getElementById('powerCalculatorContainer');
        powerContainer.style.display = '';
        render();

        // Изменяем вид кнопки в сайдбаре
        const powerBtn = document.getElementById('showPowerCalcBtn');
        if (powerBtn) {
            powerBtn.classList.remove('btn-primary');
            powerBtn.classList.add('btn-inactive');
            powerBtn.innerHTML = '<i class="fas fa-calculator"></i> Калькулятор питания';
        }
    }

    function init() {
        loadSettings();
        unsubscribe = AppState.subscribe(() => {
            const container = document.getElementById('powerCalculatorContainer');
            if (container && container.style.display !== 'none') render();
        });
        render();
    }

    function destroy() {
        if (unsubscribe) unsubscribe();
    }

    return { init, destroy, showPowerCalculator, closePowerCalculator };
})();
