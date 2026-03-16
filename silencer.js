/**
 * Lead Genius Console Silencer
 * Runs in the MAIN world to intercept page-level console noise.
 */
(function() {
    const silenceStrings = [
        'platform-telemetry', 'li/apfcDf', 'MutationObserver', 'visitor.publishDestinations', 
        'WebGL context', 'WebGL contexts', 'utag.js', 'link rel=preload', 'ERR_BLOCKED_BY_CLIENT',
        'Failed to load resource', 'extension initialized', 'parameter 1 is not of type node',
        'unload is not allowed', 'Permissions policy violation', 'Self-XSS', 'attackers to impersonate you',
        'Do not enter or paste code', 'permissions policy', 'violation', 'web-client', 'chrome-extension://invalid'
    ].map(s => s.toLowerCase());

    /**
     * PERMANENT BEHAVIORAL FIX:
     * Instead of just hiding the error, we proxy the MutationObserver itself.
     * If a script (like an extension) tries to observe something that isn't a Node,
     * we silently ignore it so the browser NEVER throws the red TypeError.
     */
    try {
        const origObserve = MutationObserver.prototype.observe;
        MutationObserver.prototype.observe = function(target, options) {
            if (!target || !(target instanceof Node)) return;
            return origObserve.call(this, target, options);
        };
    } catch (e) {}
    
    function shouldSilence(args) {
        try {
            return args.some(arg => {
                if (!arg) return false;
                
                // Convert argument to string, including error messages/stacks
                let str = "";
                if (arg instanceof Error) {
                    str = (arg.message || "") + " " + (arg.stack || "");
                } else if (typeof arg === 'object') {
                    try { str = JSON.stringify(arg); } catch(e) { str = String(arg); }
                } else {
                    str = String(arg);
                }
                
                str = str.toLowerCase();
                return silenceStrings.some(s => str.includes(s));
            });
        } catch (e) { return false; }
    }

    // Wrap ALL console methods
    const methods = ['log', 'warn', 'error', 'info', 'debug', 'dir', 'table', 'trace', 'group', 'groupCollapsed'];
    methods.forEach(method => {
        try {
            const orig = console[method];
            if (typeof orig === 'function') {
                console[method] = function(...args) {
                    if (shouldSilence(args)) return;
                    orig.apply(console, args);
                };
            }
        } catch (e) {}
    });

    /**
     * NUCLEAR CLEAR: Repetitive clearing to hide persistent browser noise.
     */
    const forceClear = () => {
        try { if (typeof console.clear === 'function') console.clear(); } catch (e) {}
    };

    // Run clear at intervals to catch late-loading noise
    [0, 50, 100, 200, 500, 1000, 2000, 3000, 5000, 10000].forEach(ms => setTimeout(forceClear, ms));

    // Global listeners for uncaught script errors
    const silenceError = (e) => {
        const payload = [e.message, e.filename, e.error, e.reason];
        if (shouldSilence(payload)) {
            e.stopImmediatePropagation();
            e.preventDefault();
            return true;
        }
    };

    window.addEventListener('error', silenceError, true);
    window.addEventListener('unhandledrejection', silenceError, true);

    // Final Badge
    console.log("%c🛡️ Lead Genius: Deep Defense Shield Active", "color: #2563eb; font-weight: bold; font-family: sans-serif; padding: 2px 4px; border-radius: 2px;");
})();
