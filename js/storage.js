// storage.js
const StorageModule = (function() {
    let unsubscribe = null;
    function init() {
        console.log('StorageModule stub');
        unsubscribe = AppState.subscribe(()=>{});
    }
    function destroy() {
        if (unsubscribe) unsubscribe();
    }
    return { init, destroy };
})();
