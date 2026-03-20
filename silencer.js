/**
 * Silencer - Lead Genius Chrome Extension
 * Silences common console noise from LinkedIn and third-party extensions
 * to provide a cleaner developer environment.
 */
(function() {
    if (window.LG_SILENCER_INITIALIZED) return;
    window.LG_SILENCER_INITIALIZED = true;

    const silenceStrings = [
        'Do not enter or paste code', 
        'permissions policy', 
        'violation', 
        'web-client', 
        'chrome-extension://invalid', 
        'network error',
        'extension context invalidated'
    ].map(s => s.toLowerCase());

    const shouldSilence = (args) => {
        try {
            // Concatenate all string versions of arguments for searching
            let text = "";
            for(let i=0; i<args.length; i++) {
                const arg = args[i];
                if (typeof arg === 'string') text += arg;
                else if (arg instanceof Error) text += arg.message;
                // Avoid JSON.stringify on objects during silencing check 
                // as it can reach recursivity limits or break proxies
            }
            text = text.toLowerCase();
            return silenceStrings.some(s => text.includes(s));
        } catch (e) {
            return false;
        }
    };

    ['log', 'info', 'warn', 'error', 'debug'].forEach(method => {
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

    // Fix for MutationObserver errors often seen on LinkedIn
    const OrigMutationObserver = window.MutationObserver;
    window.MutationObserver = function(callback) {
        return new OrigMutationObserver(function(mutations, observer) {
            try {
                callback(mutations, observer);
            } catch (e) {
                // Silently handle observer crashes
            }
        });
    };
    window.MutationObserver.prototype = OrigMutationObserver.prototype;

})();
