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
        'MutationObserver',
        'unload is not allowed',
        'Permissions policy violation',
        'Self-XSS',
        'attackers to impersonate you',
        'Do not enter or paste code'
    ];
    
    function shouldSilence(args) {
        try {
            return args.some(arg => {
                const str = String(arg).toLowerCase();
                return silenceStrings.some(s => str.includes(s.toLowerCase()));
            });
        } catch (e) { return false; }
    }

    // Capture original methods
    const origError = console.error;
    const origWarn = console.warn;
    const origLog = console.log;

    console.error = function(...args) {
        if (shouldSilence(args)) return;
        origError.apply(console, args);
    };
    
    console.warn = function(...args) {
        if (shouldSilence(args)) return;
        origWarn.apply(console, args);
    };

    console.log = function(...args) {
        if (shouldSilence(args)) return;
        origLog.apply(console, args);
    };

    // Aggressive clear on start to hide browser-cached noise
    console.clear();

    // Global error handlers
    window.addEventListener('error', function(e) {
        const errInfo = [e.message, e.filename, e.error];
        if (shouldSilence(errInfo)) {
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
