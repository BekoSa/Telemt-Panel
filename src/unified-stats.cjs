'use strict';

function numberOrZero(value) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function normalizeUnifiedSnapshot({ edge, web } = {}) {
  const totals = edge?.data?.totals || {};
  const runtime = web?.runtime || {};
  const mtproxy = {
    current: numberOrZero(totals.current_connections),
    direct: numberOrZero(totals.current_connections_direct),
    me: numberOrZero(totals.current_connections_me),
    activeUsers: numberOrZero(totals.active_users),
  };
  const webPlane = {
    sessions: numberOrZero(runtime.manager?.sessions),
    streams: numberOrZero(runtime.streams?.live),
    wssSockets: numberOrZero(runtime.websockets?.entries),
    bytesUp: numberOrZero(runtime.bytes_up),
    bytesDown: numberOrZero(runtime.bytes_down),
  };
  return {
    mtproxy,
    web: webPlane,
    clientActivity: mtproxy.current + webPlane.sessions,
  };
}

function createTimelineBuffer() {
  return {
    labels: [],
    mtproxy: [],
    direct: [],
    me: [],
    activeUsers: [],
    webSessions: [],
    webStreams: [],
    wssSockets: [],
  };
}

function appendTimelinePoint(buffer, snapshot, label, maxPoints = 72) {
  const values = {
    labels: label,
    mtproxy: numberOrZero(snapshot?.mtproxy?.current),
    direct: numberOrZero(snapshot?.mtproxy?.direct),
    me: numberOrZero(snapshot?.mtproxy?.me),
    activeUsers: numberOrZero(snapshot?.mtproxy?.activeUsers),
    webSessions: numberOrZero(snapshot?.web?.sessions),
    webStreams: numberOrZero(snapshot?.web?.streams),
    wssSockets: numberOrZero(snapshot?.web?.wssSockets),
  };
  for (const [key, value] of Object.entries(values)) {
    buffer[key].push(value);
    if (buffer[key].length > maxPoints) buffer[key].shift();
  }
  return buffer;
}

function buildTopUserRows(users = [], webSessions = []) {
  const rows = new Map();
  for (const user of users || []) {
    if (!user?.username) continue;
    rows.set(user.username, {
      username: user.username,
      mtproxyConnections: numberOrZero(user.current_connections),
      webSessions: 0,
      activity: numberOrZero(user.current_connections),
    });
  }
  for (const session of webSessions || []) {
    const username = session?.user;
    if (!username) continue;
    const row = rows.get(username) || {
      username,
      mtproxyConnections: 0,
      webSessions: 0,
      activity: 0,
    };
    row.webSessions += 1;
    row.activity = row.mtproxyConnections + row.webSessions;
    rows.set(username, row);
  }
  return [...rows.values()]
    .map(row => ({ ...row, activity: row.mtproxyConnections + row.webSessions }))
    .sort((a, b) => b.activity - a.activity || a.username.localeCompare(b.username));
}

module.exports = {
  normalizeUnifiedSnapshot,
  createTimelineBuffer,
  appendTimelinePoint,
  buildTopUserRows,
};
