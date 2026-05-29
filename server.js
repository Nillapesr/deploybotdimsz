
const express = require("express")
const http = require("http")
const fs = require("fs")

const {
 default: makeWASocket,
 useMultiFileAuthState,
 DisconnectReason,
 Browsers
} = require("@whiskeysockets/baileys")

const P = require("pino")
const { Server } = require("socket.io")

const app = express()
const server = http.createServer(app)
const io = new Server(server)

app.use(express.json())
app.use(express.static("public"))

const sessions = {}

async function startSession(sessionId){

 if(sessions[sessionId]) return sessions[sessionId]

 const path = "./sessions/" + sessionId

 const { state, saveCreds } =
 await useMultiFileAuthState(path)

 const sock = makeWASocket({
   auth: state,
   browser: Browsers.windows("Chrome"),
   logger: P({ level:"silent" })
 })

 sock.ev.on("creds.update", saveCreds)

 sock.ev.on("connection.update", async(update)=>{

   const { connection, lastDisconnect } = update

   if(connection === "open"){
      log(sessionId, "BOT CONNECTED")
   }

   if(connection === "close"){

      log(sessionId, "BOT DISCONNECTED")

      const reason =
      lastDisconnect?.error?.output?.statusCode

      if(reason !== DisconnectReason.loggedOut){
         delete sessions[sessionId]
         startSession(sessionId)
      }
   }
 })

 sock.ev.on("messages.upsert", async({ messages })=>{

   const msg = messages[0]

   if(!msg.message) return

   const text =
   msg.message.conversation ||
   msg.message.extendedTextMessage?.text || ""

   const from = msg.key.remoteJid

   log(sessionId, "CHAT: " + text)

   const menu =
`╭─ WA PANEL BOT
├ .menu
├ .ping
├ .alive
├ .owner
├ .runtime
├ .info
├ .help
├ .test
├ .say
├ .id
├ .time
├ .date
├ .uptime
├ .status
├ .bot
├ .menu2
├ .menu3
├ .hello
├ .ownerbot
├ .speed
├ .public
├ .self
├ .group
├ .tagall
├ .hidetag
├ .antilink
├ .welcome
├ .ai
├ .sticker
├ .restart
╰──────────`

   if(text === ".menu"){
      await sock.sendMessage(from,{ text: menu })
   }

   if(text === ".ping"){
      await sock.sendMessage(from,{ text:"PONG 🟢" })
   }

   if(text === ".alive"){
      await sock.sendMessage(from,{ text:"BOT ACTIVE" })
   }

   if(text === ".owner"){
      await sock.sendMessage(from,{ text:"Owner Panel" })
   }

   if(text === ".runtime"){
      await sock.sendMessage(from,{ text: process.uptime().toFixed(0)+" seconds"})
   }

   if(text === ".hello"){
      await sock.sendMessage(from,{ text:"Hello 👋"})
   }

 })

 sessions[sessionId] = {
   sock,
   active: true
 }

 return sessions[sessionId]
}

function log(sessionId, text){
 console.log(sessionId, text)

 io.emit("log",{
   sessionId,
   text
 })
}

app.post("/create-session", async(req,res)=>{

 const { sessionId } = req.body

 if(!sessionId){
   return res.json({
     success:false,
     message:"sessionId required"
   })
 }

 await startSession(sessionId)

 res.json({
   success:true
 })
})

app.post("/pair", async(req,res)=>{

 try{

 const { sessionId, number } = req.body

 if(!sessions[sessionId]){
   return res.json({
      success:false,
      message:"session not found"
   })
 }

 const code =
 await sessions[sessionId]
 .sock
 .requestPairingCode(number)

 res.json({
   success:true,
   code: code.match(/.{1,4}/g).join("-")
 })

 }catch(e){
   res.json({
     success:false,
     message:e.message
   })
 }

})

app.post("/send", async(req,res)=>{

 try{

 const { sessionId, number, message } = req.body

 await sessions[sessionId]
 .sock
 .sendMessage(
   number + "@s.whatsapp.net",
   { text: message }
 )

 res.json({
   success:true
 })

 }catch(e){
   res.json({
     success:false,
     message:e.message
   })
 }

})

app.post("/restart", async(req,res)=>{

 const { sessionId } = req.body

 delete sessions[sessionId]

 await startSession(sessionId)

 res.json({
   success:true
 })

})

app.post("/stop", async(req,res)=>{

 const { sessionId } = req.body

 if(sessions[sessionId]){
   await sessions[sessionId].sock.logout()
   delete sessions[sessionId]
 }

 res.json({
   success:true
 })

})

app.get("/sessions",(req,res)=>{

 res.json({
   total:Object.keys(sessions).length,
   sessions:Object.keys(sessions)
 })

})

app.get("/",(req,res)=>{
 res.sendFile(__dirname + "/public/index.html")
})

const PORT = process.env.PORT || 3000

server.listen(PORT,()=>{
 console.log("RUNNING", PORT)
})
