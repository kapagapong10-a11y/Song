import { initializeApp } from "https://www.gstatic.com/firebasejs/10.5.0/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.5.0/firebase-auth.js";
import { getDatabase, ref, set, push, get, onValue, update, remove, runTransaction } from "https://www.gstatic.com/firebasejs/10.5.0/firebase-database.js";

// ใส่ Config ของคุณ
const firebaseConfig = {
  apiKey: "AIzaSyDS2Nol9xO6UzGXBv8mYbxyxc0nVp74oz8",
  authDomain: "song-5883e.firebaseapp.com",
  databaseURL: "https://song-5883e-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "song-5883e",
  storageBucket: "song-5883e.firebasestorage.app",
  messagingSenderId: "623791116667",
  appId: "1:623791116667:web:5d9318b2dad7d4ffa36dde",
  measurementId: "G-NNF61V3Y16"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getDatabase(app);

let isLoginMode = true;
let currentUserData = null;
let currentRoomId = null;

// --- ฟังก์ชันจัดการเวลาสำหรับ Reset ตอนเที่ยงคืนไทย ---
function getThaiDateString() {
    // ดึงวันที่ตามเวลาประเทศไทย
    return new Date().toLocaleDateString("en-US", { timeZone: "Asia/Bangkok" });
}

function checkAndResetRoom(roomName) {
    const today = getThaiDateString();
    const roomRef = ref(db, `rooms/${roomName}`);
    get(roomRef).then((snapshot) => {
        if (snapshot.exists()) {
            const roomData = snapshot.val();
            // ถ้าระบบตรวจพบว่าวันที่มีการขยับ (ข้ามคืน)
            if (roomData.lastReset !== today) {
                // เคลียร์เพลงของห้องนั้นทิ้งทั้งหมด และอัปเดตวันที่ล่าสุด
                remove(ref(db, `songs/${roomName}`));
                update(ref(db, `rooms/${roomName}`), { lastReset: today });
            }
        }
    });
}

// --- UI Navigation ---
window.switchView = (viewId) => {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.getElementById(viewId).classList.add('active');
}

window.toggleAuthMode = () => {
    isLoginMode = !isLoginMode;
    document.getElementById('authTitle').innerText = isLoginMode ? 'เข้าสู่ระบบ' : 'สมัครสมาชิก';
    document.getElementById('authBtn').innerText = isLoginMode ? 'เข้าสู่ระบบ' : 'สมัครสมาชิก';
    document.getElementById('toggleAuthBtn').innerText = isLoginMode ? 'ยังไม่มีบัญชี? สมัครเลย' : 'มีบัญชีแล้ว? เข้าสู่ระบบ';
    document.getElementById('signupFields').style.display = isLoginMode ? 'none' : 'block';
}

window.showAdminLogin = () => {
    isLoginMode = true;
    document.getElementById('authTitle').innerText = 'Admin Login';
    document.getElementById('signupFields').style.display = 'none';
    document.getElementById('authBtn').innerText = 'เข้าสู่ระบบแอดมิน';
    // สร้างอีเมลและรหัสผ่านแอดมินจำลอง หรือใช้อีเมลแอดมินที่กำหนดไว้
    document.getElementById('email').value = 'admin@admin.com'; 
}

window.showAddSong = () => { window.switchView('addSongView'); }
window.showStudentView = () => { window.switchView('studentView'); }

// --- Auth System ---
window.handleAuth = async () => {
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    
    try {
        if (isLoginMode) {
            await signInWithEmailAndPassword(auth, email, password);
        } else {
            const fullname = document.getElementById('fullname').value;
            const classroom = document.getElementById('classroom').value.replace(/\//g, '-'); // เปลี่ยน ม.1/2 เป็น ม.1-2 ป้องกัน error ใน path
            const studentNo = document.getElementById('studentNo').value;
            
            if(!fullname || !classroom || !studentNo) return alert("กรุณากรอกข้อมูลให้ครบถ้วน");

            const userCredential = await createUserWithEmailAndPassword(auth, email, password);
            // บันทึกข้อมูลส่วนตัวลง Realtime DB
            await set(ref(db, 'users/' + userCredential.user.uid), {
                fullname: fullname,
                classroom: classroom,
                studentNo: studentNo,
                role: 'user'
            });
            alert('สมัครสมาชิกสำเร็จ!');
        }
    } catch (error) {
        alert("Error: " + error.message);
    }
}

window.logout = () => { signOut(auth); }

// --- Auth State Observer ---
onAuthStateChanged(auth, (user) => {
    if (user) {
        get(ref(db, 'users/' + user.uid)).then((snapshot) => {
            if (snapshot.exists()) {
                currentUserData = snapshot.val();
                if (currentUserData.role === 'admin') {
                    window.switchView('adminView');
                    loadAdminData();
                } else {
                    window.switchView('studentView');
                    currentRoomId = currentUserData.classroom;
                    document.getElementById('studentRoomName').innerText = `ห้อง: ${currentRoomId.replace('-', '/')}`;
                    loadStudentRoom();
                }
            } else {
                // หากไม่มีข้อมูลใน DB (กรณีสร้างแอดมินมือเองในหน้า Firebase) ให้ถือว่าเป็น Admin
                if(user.email === 'admin@admin.com'){
                     set(ref(db, 'users/' + user.uid), { role: 'admin' });
                     window.switchView('adminView');
                     loadAdminData();
                }
            }
        });
    } else {
        window.switchView('authView');
        currentUserData = null;
    }
});

// --- Student Logic ---
function loadStudentRoom() {
    const roomRef = ref(db, `rooms/${currentRoomId}`);
    
    // ตรวจสอบเที่ยงคืนก่อนโหลดข้อมูล
    checkAndResetRoom(currentRoomId);

    onValue(roomRef, (snapshot) => {
        if (snapshot.exists()) {
            document.getElementById('noRoomAlert').style.display = 'none';
            document.getElementById('songList').style.display = 'flex';
            loadSongs();
        } else {
            document.getElementById('noRoomAlert').style.display = 'block';
            document.getElementById('songList').style.display = 'none';
        }
    });
}

function loadSongs() {
    const songsRef = ref(db, `songs/${currentRoomId}`);
    onValue(songsRef, (snapshot) => {
        const songListDiv = document.getElementById('songList');
        songListDiv.innerHTML = '';
        if (snapshot.exists()) {
            const songs = [];
            snapshot.forEach(child => {
                songs.push({ id: child.key, ...child.val() });
            });
            
            // เรียงลำดับโหวตจากมากไปน้อย
            songs.sort((a, b) => b.votes - a.votes);

            songs.forEach(song => {
                const isVoted = song.voters && song.voters[auth.currentUser.uid];
                songListDiv.innerHTML += `
                    <div class="song-item">
                        <div class="song-info">
                            <h4>${song.title}</h4>
                            <p><i class="fas fa-microphone"></i> ${song.artist}</p>
                            <p style="font-size:10px; color:#b2bec3;">เสนอโดย: ${song.addedByName}</p>
                        </div>
                        <button class="vote-btn ${isVoted ? 'voted' : ''}" onclick="voteSong('${song.id}')">
                            <i class="fas fa-chevron-up"></i>
                            <span>${song.votes}</span>
                        </button>
                    </div>
                `;
            });
        } else {
            songListDiv.innerHTML = '<p style="text-align:center; color:#fff;">ยังไม่มีคนขอเพลงเลย แอดเพลงแรกเลย!</p>';
        }
    });
}

window.addSong = async () => {
    const title = document.getElementById('songTitle').value;
    const artist = document.getElementById('songArtist').value;
    if(!title || !artist) return alert("กรุณากรอกข้อมูลเพลงให้ครบ");

    await push(ref(db, `songs/${currentRoomId}`), {
        title: title,
        artist: artist,
        addedByUid: auth.currentUser.uid,
        addedByName: currentUserData.fullname,
        votes: 1,
        voters: { [auth.currentUser.uid]: true } // ผู้ขอจะถูกนับโหวตให้เลย
    });

    document.getElementById('songTitle').value = '';
    document.getElementById('songArtist').value = '';
    window.showStudentView();
}

window.voteSong = (songId) => {
    const songRef = ref(db, `songs/${currentRoomId}/${songId}`);
    const uid = auth.currentUser.uid;

    runTransaction(songRef, (song) => {
        if (song) {
            if (!song.voters) song.voters = {};
            if (!song.voters[uid]) {
                // ถ้ายังไม่เคยโหวตเพลงนี้ ให้เพิ่มโหวต
                song.voters[uid] = true;
                song.votes++;
            } else {
                // ถ้าอยากให้กดซ้ำเพื่อเอาโหวตออก ให้เปิดคอมเมนต์โค้ดด้านล่างนี้
                // delete song.voters[uid];
                // song.votes--;
            }
        }
        return song;
    });
}

// --- Admin Logic ---
window.createRoom = () => {
    let rawRoomName = document.getElementById('newRoomName').value;
    if(!rawRoomName) return;
    const roomName = rawRoomName.replace(/\//g, '-'); // ป้องกัน error path
    
    set(ref(db, `rooms/${roomName}`), {
        createdAt: Date.now(),
        lastReset: getThaiDateString() // เก็บวันที่สร้างเพื่อใช้เปรียบเทียบตอนเที่ยงคืน
    }).then(() => {
        alert(`สร้างห้อง ${rawRoomName} สำเร็จ`);
        document.getElementById('newRoomName').value = '';
    });
}

function loadAdminData() {
    // โหลดห้องทั้งหมด
    onValue(ref(db, 'rooms'), (snapshot) => {
        const adminRoomList = document.getElementById('adminRoomList');
        adminRoomList.innerHTML = '';
        if (snapshot.exists()) {
            snapshot.forEach(child => {
                adminRoomList.innerHTML += `<div style="padding: 5px; border-bottom: 1px solid #eee;">${child.key.replace('-', '/')}</div>`;
            });
        }
    });

    // โหลดรายชื่อผู้ใช้งานเพื่อลบ
    onValue(ref(db, 'users'), (snapshot) => {
        const adminUserList = document.getElementById('adminUserList');
        adminUserList.innerHTML = '';
        if (snapshot.exists()) {
            snapshot.forEach(child => {
                const user = child.val();
                if(user.role !== 'admin') {
                    adminUserList.innerHTML += `
                        <div style="display:flex; justify-content:space-between; padding: 5px; border-bottom: 1px solid #eee;">
                            <span>${user.fullname} (${user.classroom.replace('-','/')})</span>
                            <button onclick="deleteUser('${child.key}')" style="background:#ff7675; color:white; border:none; padding:2px 8px; border-radius:5px; cursor:pointer;">ลบ</button>
                        </div>
                    `;
                }
            });
        }
    });
}

window.deleteUser = (uid) => {
    if(confirm('ต้องการลบข้อมูลผู้ใช้นี้ออกจากฐานข้อมูลใช่หรือไม่?')) {
        remove(ref(db, `users/${uid}`));
        // ข้อควรระวัง: การลบผ่าน Client-side DB ไม่ได้ลบ Account ใน Auth แต่ผู้ใช้จะเข้าระบบและทำรายการไม่ได้เพราะไม่มีข้อมูลใน DB
    }
}
