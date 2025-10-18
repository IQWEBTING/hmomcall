// server.js
const WebSocket = require('ws');
const { v4: uuidv4 } = require('uuid');

const port = process.env.PORT || 3000;
const wss = new WebSocket.Server({ port });

console.log('Signaling server listening on port', port);

// roomId -> [ws, ws]
const rooms = new Map();

wss.on('connection', (ws) => {
  ws.id = uuidv4();
  ws.roomId = null;

  ws.on('message', (msgRaw) => {
    let msg;
    try { msg = JSON.parse(msgRaw); } catch (e) { return; }

    const { action, roomId, data } = msg;

    if (action === 'create') {
      const id = roomId || uuidv4().slice(0,8);
      ws.roomId = id;
      rooms.set(id, rooms.get(id) || []);
      rooms.get(id).push(ws);
      ws.send(JSON.stringify({ action: 'created', roomId: id }));
      console.log('created room', id);
      return;
    }

    if (action === 'join') {
      const id = roomId;
      if (!id || !rooms.has(id)) {
        ws.send(JSON.stringify({ action: 'error', reason: 'room-not-found' }));
        return;
      }
      ws.roomId = id;
      rooms.get(id).push(ws);
      // notify other peer
      rooms.get(id).forEach(peer => {
        if (peer !== ws) peer.send(JSON.stringify({ action: 'peer-joined' }));
      });
      ws.send(JSON.stringify({ action: 'joined', roomId: id }));
      console.log('joined room', id);
      return;
    }

    // relay signaling messages (offer/answer/candidate)
    if (['offer', 'answer', 'candidate', 'leave'].includes(action)) {
      const peers = rooms.get(ws.roomId) || [];
      peers.forEach(peer => {
        if (peer !== ws && peer.readyState === WebSocket.OPEN) {
          peer.send(JSON.stringify({ action, data }));
        }
      });
      if (action === 'leave') {
        // cleanup
        rooms.set(ws.roomId, (rooms.get(ws.roomId) || []).filter(p => p !== ws));
        console.log('peer left room', ws.roomId);
      }
      return;
    }
  });

  ws.on('close', () => {
    if (ws.roomId) {
      const arr = rooms.get(ws.roomId) || [];
      const newArr = arr.filter(p => p !== ws);
      if (newArr.length === 0) rooms.delete(ws.roomId);
      else rooms.set(ws.roomId, newArr);
      // notify remaining peer
      newArr.forEach(peer => {
        if (peer.readyState === WebSocket.OPEN) peer.send(JSON.stringify({ action: 'peer-left' }));
      });
    }
  });
});
