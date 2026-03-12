/**
 * Lead Genius Console Silencer
 * Runs in the MAIN world to intercept page-level console noise.
 */
(function() {
    const silenceStrings = [
        'platform-telemetry', 
        'li/apfcDf', 
        'MutationObserver', 
        'visitor.publishDestinations', 
        'WebGL context', 
        'WebGL contexts',
        'utag.js',
        'link rel=preload',
        'ERR_BLOCKED_BY_CLIENT',
        'Failed to load resource',
        'extension initialized',
        'parameter 1 is not of type \'Node\'',
        'unload is not allowed',
        'Permissions policy violation',
        'Self-XSS',
        'attackers to impersonate you',
        'Do not enter or paste code',
        'permissions policy',
        'violation'
    ];
    
    function shouldSilence(args) {
        try {
            return args.some(arg => {
                if (!arg) return false;
                const str = String(arg).toLowerCase();
                return silenceStrings.some(s => str.includes(s.toLowerCase()));
            });
        } catch (e) { return false; }
    }

    // Capture and silence all console methods
    ['log', 'warn', 'error', 'info', 'debug', 'dir', 'table', 'trace'].forEach(method => {
        const orig = console[method];
        if (typeof orig === 'function') {
            console[method] = function(...args) {
                if (shouldSilence(args)) return;
                orig.apply(console, args);
            };
        }
    });

    // Aggressive clear to wipe cached browser noise
    setTimeout(() => console.clear(), 100);
    setTimeout(() => console.clear(), 500);

    // Global error handlers
    window.addEventListener('error', function(e) {
        if (shouldSilence([e.message, e.filename, e.error])) {
            e.stopImmediatePropagation();
            e.preventDefault();
        }
    }, true);

    window.addEventListener('unhandledrejection', function(e) {
        if (shouldSilence([e.reason])) {
            e.stopImmediatePropagation();
            e.preventDefault();
        }
    }, true);

    console.log("%c🛡️ Lead Genius: Deep Defense Layer active.", "color: #2563eb; font-weight: bold;");
})();
