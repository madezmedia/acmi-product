/* fleet-read-auth.js — attach the fleet read bearer to same-origin data reads.

   The server secret is ACMI_READ_BEARER. This file never contains that value.
   An operator session supplies the same string in one of two places:

     sessionStorage["acmi_read_bearer"]
     window.ACMI_READ_BEARER

   Set it from the console (the value is not logged by this script):

     acmiSetFleetReadBearer("<same value as ACMI_READ_BEARER>")

   Then reload. Without it, gated /api reads return 401 and each page keeps
   its existing empty/mock/error fallback.
*/
(function () {
  var STORAGE_KEY = "acmi_read_bearer";

  // Exact pathnames. /api/chain and /api/chains are distinct.
  var EXACT = {
    "/api/fleet": true,
    "/api/comms": true,
    "/api/work": true,
    "/api/hitl": true,
    "/api/events": true,
    "/api/stories": true,
    "/api/chains": true,
    "/api/chain": true,
    "/api/gpu": true,
    "/api/governance": true
  };

  function readToken() {
    try {
      if (typeof window.ACMI_READ_BEARER === "string" && window.ACMI_READ_BEARER.trim()) {
        return window.ACMI_READ_BEARER.trim();
      }
      var stored = sessionStorage.getItem(STORAGE_KEY) || "";
      return stored.trim();
    } catch (e) {
      return "";
    }
  }

  function isFleetReadPath(pathname) {
    if (!pathname) return false;
    if (pathname.length > 1 && pathname.charAt(pathname.length - 1) === "/") {
      pathname = pathname.slice(0, -1);
    }
    if (EXACT[pathname]) return true;
    return pathname.indexOf("/api/agent/") === 0;
  }

  window.acmiFleetReadHeaders = function () {
    var token = readToken();
    if (!token) return {};
    return { Authorization: "Bearer " + token };
  };

  window.acmiSetFleetReadBearer = function (token) {
    try {
      if (typeof token !== "string" || !token.trim()) {
        sessionStorage.removeItem(STORAGE_KEY);
        return false;
      }
      sessionStorage.setItem(STORAGE_KEY, token.trim());
      return true;
    } catch (e) {
      return false;
    }
  };

  if (typeof window.fetch === "function" && !window.fetch.__acmiFleetRead) {
    var origFetch = window.fetch.bind(window);
    var wrapped = function (input, init) {
      var url = "";
      if (typeof input === "string") url = input;
      else if (input && typeof input.url === "string") url = input.url;
      var pathname = "";
      try {
        pathname = new URL(url, window.location.origin).pathname;
      } catch (e) {
        pathname = "";
      }
      if (!isFleetReadPath(pathname)) return origFetch(input, init);
      var token = readToken();
      if (!token) return origFetch(input, init);
      var headers = new Headers((init && init.headers) || (input && input.headers) || undefined);
      if (!headers.has("Authorization")) headers.set("Authorization", "Bearer " + token);
      var next = Object.assign({}, init, { headers: headers });
      return origFetch(input, next);
    };
    wrapped.__acmiFleetRead = true;
    window.fetch = wrapped;
  }
})();
