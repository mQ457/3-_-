let broadcaster = () => {};

function setBroadcaster(nextBroadcaster) {
  broadcaster = typeof nextBroadcaster === "function" ? nextBroadcaster : () => {};
}

function publish(event, payload = {}) {
  try {
    broadcaster({
      event: String(event || "").trim() || "message",
      payload: payload && typeof payload === "object" ? payload : {},
      timestamp: new Date().toISOString(),
    });
  } catch (_error) {}
}

module.exports = {
  setBroadcaster,
  publish,
};
