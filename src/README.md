1.打開終端機(CMD)
  輸入node server.js
2.打開第二個終端機視窗，輸入你的專案密碼
  ngrok config add-authtoken 你的實際Token字串
3.開啟對外通道（每次測試都要開）
  ngrok http 3000
4.在 ngrok 畫面上找到 Forwarding 欄位，複製 https://xxxx-xxxx.ngrok-free.app 的網址
