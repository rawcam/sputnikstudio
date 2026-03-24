// led.js
const LedModule = (function() {
    let unsubscribe = null;
    function init() { console.log('LedModule stub'); unsubscribe = AppState.subscribe(()=>{}); }
    function destroy() { if (unsubscribe) unsubscribe(); }
    return { init, destroy };
})();
