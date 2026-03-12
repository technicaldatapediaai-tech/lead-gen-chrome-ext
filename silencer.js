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
        'utag.js'
    ];
    
    function shouldSilence(args) {
        try {
            const str = args.map(a => {
                if (typeof a === 'string') return a;
                if (a && a.message) return a.message;
                if (a && a.stack) return a.stack;
                return String(a);
            }).join(' ');
            return silenceStrings.some(s => str.includes(s));
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

    // Also suppress specific logs if they contain noise
    console.log = function(...args) {
        if (shouldSilence(args)) return;
        origLog.apply(console, args);
    };

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

    // Initial console cleanup
    console.clear();
    console.log("%c🛡️ Lead Genius: Defensive layer active. LinkedIn noise suppressed.", "color: #2563eb; font-weight: bold;");
})();
