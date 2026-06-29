const express = require('express');
const path = require('path');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http, { cors: { origin: "*" } });

// 自動提供 public 資料夾內的靜態檔案 (例如 index.html)
app.use(express.static(path.join(__dirname, '../public')));

let rooms = {};

function generateRoomCode() {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
}

io.on('connection', (socket) => {
    let currentRoom = null;

    socket.on('create_room', (config = {}) => {
        const roomId = generateRoomCode();
        rooms[roomId] = { 
            hostId: socket.id,
            config: config,
            usedColors: [], 
            usedNames: []
        };
        socket.join(roomId);
        currentRoom = roomId;
        socket.emit('room_joined', { roomId: roomId, mapSize: config.mapSize, mapType: config.mapType || 'normal' });
    });

    socket.on('join_room', (roomId) => {
        roomId = roomId.toUpperCase();
        if (rooms[roomId]) {
            socket.join(roomId);
            currentRoom = roomId;
            socket.emit('room_joined', { 
                roomId: roomId, 
                mapSize: rooms[roomId].config.mapSize, 
                mapType: rooms[roomId].config.mapType || 'normal'
            });
            // 通知房主有新玩家連線，發起 WebRTC 邀請
            io.to(rooms[roomId].hostId).emit('new_peer_joining', { clientId: socket.id });
        } else {
            socket.emit('room_error', '找不到該房間！');
        }
    });

    socket.on('webrtc_signal', (data) => {
        io.to(data.target).emit('webrtc_signal', { sender: socket.id, signal: data.signal });
    });

    socket.on('check_availability', (data) => {
        const roomId = data.roomId;
        if (!rooms[roomId]) return socket.emit('check_result', { valid: false, msg: '房間已不存在' });
        if (rooms[roomId].usedColors.includes(data.color)) return socket.emit('check_result', { valid: false, msg: '這個顏色已經被選走了，請換一個！' });
        if (rooms[roomId].usedNames.includes(data.name)) return socket.emit('check_result', { valid: false, msg: '這個名稱已經有人使用了，請換一個！' });
        socket.emit('check_result', { valid: true });
    });
    
    socket.on('join_game', (data) => {
        const roomId = data.roomId;
        if (!rooms[roomId]) return socket.emit('color_error', '房間已不存在');
        
        rooms[roomId].usedColors.push(data.color);
        rooms[roomId].usedNames.push(data.name);

        // 通知自己加入成功，前端會隱藏大廳
        socket.emit('game_started');
        
        // 告訴房主有新玩家準備好可以加入遊戲畫面了
        io.to(rooms[roomId].hostId).emit('player_ready', {
            clientId: socket.id,
            color: data.color,
            name: data.name
        });
    });

    socket.on('disconnect', () => {
        if (currentRoom && rooms[currentRoom]) {
            const room = rooms[currentRoom];
            if (socket.id === room.hostId) {
                // 如果房主斷線，刪除房間並踢出所有人
                socket.to(currentRoom).emit('host_disconnected');
                delete rooms[currentRoom];
            } else {
                // 如果是客機斷線，通知房主清理 WebRTC 連線與玩家實體
                io.to(room.hostId).emit('client_disconnected', { clientId: socket.id });
            }
            const socketsInRoom = io.sockets.adapter.rooms.get(currentRoom);
            if (!socketsInRoom || socketsInRoom.size === 0) {
                delete rooms[currentRoom];
            }
        }
    });
});

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => {
    console.log(`P2P 信令伺服器在 port ${PORT} 運行中...`);
});
