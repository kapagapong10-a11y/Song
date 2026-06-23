import { initializeApp } from "https://www.gstatic.com/firebasejs/10.5.0/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.5.0/firebase-auth.js";
import { getDatabase, ref, set, push, get, onValue, update, remove, runTransaction } from "https://www.gstatic.com/firebasejs/10.5.0/firebase-database.js";

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

// ==========================================
// 🧠 SMART PARSER: ฟังก์ชันอัจฉริยะจัดการชื่อห้อง
// ==========================================

// แปลงข้อมูลที่พิมพ์มา ให้กลายเป็นรูปแบบ DB เช่น พิมพ์ "ม.1/5" หรือ "1/5" จะกลายเป็น "1-5" เสมอ
function formatDbRoom(input) {
    if (!input) return "";
    // ใช้ Regex ค้นหาตัวเลข 2 ชุดที่ถูกคั่นด้วยอะไรก็ตาม
    const match = input.match(/(\d+).*?(\d+)/);
    if (match) {
        return `${match[1]}-${match[2]}`; // ได้ "1-5"
    }
    // กรณีพิมพ์มาแค่ตัวเลขตัวเดียว (Fallback)
    const singleMatch = input.match(/(\d+)/);
    if (singleMatch) return `${singleMatch[1]}`;
    return input.trim();
}

// แปลงข้อมูลจาก DB ให้แสดงผลหน้าเว็บสวยงาม เช่น "1-5" จะกลายเป็น "ม.1/5"
function displayRoom(dbRoom) {
    if (!dbRoom) return "-";
    return `ม.${dbRoom.replace('-', '/')}`;
}

function getThaiDateString() {
    return new Date().toLocaleDateString("en-US", { timeZone: "Asia/Bangkok" });
}

function checkAndResetRoom(roomName) {
    const today = getThaiDateString();
    const roomRef = ref(db, `rooms/${roomName}`);
    get(roomRef).then((snapshot) => {
        if (snapshot.exists()) {
            const roomData = snapshot.val();
            if (roomData.lastReset !== today) {
                remove(ref(db, `songs/${roomName}`));
                update(ref(db, `rooms/${roomName}`), { lastReset: today });
            }
        }
    }).catch(err => console.error("Reset Check Error:", err));
}

// --- UI Navigation ---
window.switchView = (viewId) => {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.getElementById(viewId).classList.add('active');
};

window.toggleAuthMode = () => {
    isLoginMode = !isLoginMode;
    document.getElementById('authTitle').innerText = isLoginMode ? 'เข้าสู่ระบบ' : 'สมัครสมาชิก';
    document.getElementById('authBtn').innerText = isLoginMode ? 'เข้าสู่ระบบ' : 'สมัครสมาชิก';
    document.getElementById('toggleAuthBtn').innerText = isLoginMode ? 'ยังไม่มีบัญชี? สมัครเลย' : 'มีบัญชีแล้ว? เข้าสู่ระบบ';
    document.getElementById('signupFields').style.display = isLoginMode ? 'none' : 'block';
};

window.showAdminLogin = () => {
    isLoginMode = true;
    document.getElementById('authTitle').innerText = 'Admin Login';
    document.getElementById('signupFields').style.display = 'none';
    document.getElementById('authBtn').innerText = 'เข้าสู่ระบบแอดมิน';
    document.getElementById('email').value = 'admin@admin.com'; 
};

window.showAddSong = () => { window.switchView('addSongView'); };
window.showStudentView = () => { window.switchView('studentView'); };

// --- Auth System ---
window.handleAuth = async () => {
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    
    if(!email || !password) return alert("กรุณากรอกอีเมลและรหัสผ่าน");

    try {
        if (isLoginMode) {
            await signInWithEmailAndPassword(auth, email, password);
        } else {
            const fullname = document.getElementById('fullname').value;
            const rawClassroom = document.getElementById('classroom').value; 
            const studentNo = document.getElementById('studentNo').value;
            
            if(!fullname || !rawClassroom || !studentNo) return alert("กรุณากรอกข้อมูลให้ครบถ้วน");

            // ใช้ฟังก์ชันฉลาดกรองข้อมูลชั้นเรียน
            const classroom = formatDbRoom(rawClassroom);
            if(!classroom) return alert("รูปแบบชั้นเรียนไม่ถูกต้อง");

            const userCredential = await createUserWithEmailAndPassword(auth, email, password);
            await set(ref(db, 'users/' + userCredential.user.uid), {
                fullname: fullname,
                classroom: classroom,
                studentNo: parseInt(studentNo),
                role: 'user'
            });
            alert('สมัครสมาชิกสำเร็จ!');
            document.getElementById('fullname').value = '';
            document.getElementById('classroom').value = '';
            document.getElementById('studentNo').value = '';
            document.getElementById('password').value = '';
        }
    } catch (error) {
        alert("เกิดข้อผิดพลาด: " + error.message);
    }
};

window.logout = () => { signOut(auth); };

onAuthStateChanged(auth, (user) => {
    if (user) {
        get(ref(db, 'users/' + user.uid)).then((snapshot) => {
            if (snapshot.exists()) {
                currentUserData = snapshot.val();
                if (currentUserData.role === 'admin') {
                    window.switchView('adminMainView');
                    loadAdminData();
                } else {
                    window.switchView('studentView');
                    currentRoomId = currentUserData.classroom;
                    // แสดงผลสวยงามให้เด็กเห็น
                    document.getElementById('studentRoomName').innerText = `ห้อง: ${displayRoom(currentRoomId)}`;
                    loadStudentRoom();
                }
            } else {
                if(user.email === 'admin@admin.com'){
                     set(ref(db, 'users/' + user.uid), { role: 'admin', fullname: 'Administrator' });
                     window.switchView('adminMainView');
                     loadAdminData();
                } else {
                    alert("ไม่พบข้อมูลผู้ใช้ของคุณ กรุณาสมัครสมาชิกใหม่");
                    signOut(auth);
                }
            }
        }).catch(err => alert("สิทธิ์การเข้าถึงฐานข้อมูลล้มเหลว: " + err.message));
    } else {
        window.switchView('authView');
        currentUserData = null;
    }
});

// --- Student Logic ---
function loadStudentRoom() {
    const roomRef = ref(db, `rooms/${currentRoomId}`);
    checkAndResetRoom(currentRoomId);

    onValue(roomRef, (snapshot) => {
        if (snapshot.exists()) {
            document.getElementById('noRoomAlert').style.display = 'none';
            document.getElementById('songList').style.display = 'flex';
            loadSongs();
        } else {
            document.getElementById('noRoomAlert').style.display = 'block';
            document.getElementById('songList').style.display = 'none';
            document.getElementById('songList').innerHTML = '';
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
            snapshot.forEach(child => { songs.push({ id: child.key, ...child.val() }); });
            songs.sort((a, b) => b.votes - a.votes);

            songs.forEach(song => {
                const isVoted = song.voters && song.voters[auth.currentUser.uid];
                songListDiv.innerHTML += `
                    <div class="song-item">
                        <div class="song-info">
                            <h4>${song.title}</h4>
                            <p><i class="fas fa-microphone"></i> ${song.artist}</p>
                            <p style="font-size:10px; color:#b2bec3;">เสนอโดย: ${song.addedByName || 'นักเรียน'}</p>
                        </div>
                        <button class="vote-btn ${isVoted ? 'voted' : ''}" onclick="voteSong('${song.id}')">
                            <i class="fas fa-chevron-up"></i>
                            <span>${song.votes}</span>
                        </button>
                    </div>
                `;
            });
        } else {
            songListDiv.innerHTML = '<p style="text-align:center; color:#fff; width:100%;">ยังไม่มีคนขอเพลงเลย มาร่วมสนุกกัน!</p>';
        }
    });
}

window.addSong = async () => {
    const title = document.getElementById('songTitle').value.trim();
    const artist = document.getElementById('songArtist').value.trim();
    if(!title || !artist) return alert("กรุณากรอกข้อมูลเพลงให้ครบถ้วน");

    try {
        await push(ref(db, `songs/${currentRoomId}`), {
            title: title,
            artist: artist,
            addedByUid: auth.currentUser.uid,
            addedByName: currentUserData.fullname,
            votes: 1,
            voters: { [auth.currentUser.uid]: true }
        });
        document.getElementById('songTitle').value = '';
        document.getElementById('songArtist').value = '';
        window.showStudentView();
    } catch (error) {
        alert("ขอเพลงไม่สำเร็จ: " + error.message);
    }
};

window.voteSong = (songId) => {
    const songRef = ref(db, `songs/${currentRoomId}/${songId}`);
    const uid = auth.currentUser.uid;
    runTransaction(songRef, (song) => {
        if (song) {
            if (!song.voters) song.voters = {};
            if (!song.voters[uid]) {
                song.voters[uid] = true;
                song.votes++;
            } else {
                alert("คุณโหวตเพลงนี้ไปแล้ว!");
            }
        }
        return song;
    });
};

// --- Admin Logic ---
window.createRoom = () => {
    let rawRoomName = document.getElementById('newRoomName').value;
    if(!rawRoomName) return alert("กรุณากรอกชั้นเรียน");
    
    // แปลงให้เป็นรูปแบบ DB มาตรฐาน
    const roomName = formatDbRoom(rawRoomName); 
    if(!roomName) return alert("รูปแบบไม่ถูกต้อง");
    
    set(ref(db, `rooms/${roomName}`), {
        createdAt: Date.now(),
        lastReset: getThaiDateString()
    }).then(() => {
        alert(`เปิดใช้งานห้อง ${displayRoom(roomName)} เรียบร้อยแล้ว`);
        document.getElementById('newRoomName').value = '';
    });
};

window.deleteRoom = (roomName) => {
    if(confirm(`ยืนยันการลบห้อง "${displayRoom(roomName)}" และประวัติเพลงทั้งหมด?`)) {
        remove(ref(db, `rooms/${roomName}`))
            .then(() => remove(ref(db, `songs/${roomName}`)));
    }
};

window.deleteUser = (uid) => {
    if(confirm('ต้องการลบข้อมูลนักเรียนคนนี้ใช่หรือไม่?')) {
        remove(ref(db, `users/${uid}`));
    }
};

function loadAdminData() {
    // 1. โหลดข้อมูลห้อง ทั้งสำหรับการ์ดเพลง และสำหรับการลบในหน้าจัดการ
    onValue(ref(db, 'rooms'), (snapshot) => {
        const adminRoomGrid = document.getElementById('adminRoomGrid');
        const adminRoomListSystem = document.getElementById('adminRoomListSystem');
        
        adminRoomGrid.innerHTML = '';
        adminRoomListSystem.innerHTML = '';

        if (snapshot.exists()) {
            snapshot.forEach(child => {
                const roomDisplay = displayRoom(child.key);
                
                // สำหรับหน้าจัดการเพลง (การ์ด)
                adminRoomGrid.innerHTML += `
                    <div class="room-card" onclick="viewRoomAdmin('${child.key}')">
                        <i class="fas fa-door-open" style="font-size: 24px; margin-bottom: 5px;"></i>
                        <h4>${roomDisplay}</h4>
                    </div>
                `;

                // สำหรับหน้าจัดการระบบ (ลบห้อง)
                adminRoomListSystem.innerHTML += `
                    <div style="display:flex; justify-content:space-between; align-items:center; padding: 8px 5px; border-bottom: 1px solid #eee;">
                        <span style="color:#2d3436; font-weight:500;">${roomDisplay}</span>
                        <button onclick="deleteRoom('${child.key}')" style="background:#ff7675; color:white; border:none; padding:4px 10px; border-radius:6px; cursor:pointer; font-size:12px;"><i class="fas fa-trash"></i> ลบ</button>
                    </div>
                `;
            });
        } else {
            adminRoomGrid.innerHTML = '<p style="color:#fff; text-align:center; grid-column: 1 / -1;">ยังไม่มีการเปิดห้อง</p>';
            adminRoomListSystem.innerHTML = '<p style="color:#777; text-align:center;">ยังไม่มีการเปิดห้อง</p>';
        }
    });

    // 2. โหลดข้อมูลนักเรียน สำหรับหน้าจัดการระบบ
    onValue(ref(db, 'users'), (snapshot) => {
        const adminUserList = document.getElementById('adminUserList');
        adminUserList.innerHTML = '';
        let hasUsers = false;
        
        if (snapshot.exists()) {
            snapshot.forEach(child => {
                const user = child.val();
                if(user.role !== 'admin') {
                    hasUsers = true;
                    adminUserList.innerHTML += `
                        <div style="display:flex; justify-content:space-between; align-items:center; padding: 8px 5px; border-bottom: 1px solid #eee;">
                            <span style="color:#2d3436; font-size:14px;">${user.fullname} (${displayRoom(user.classroom)}) เลขที่ ${user.studentNo || '-'}</span>
                            <button onclick="deleteUser('${child.key}')" style="background:#ff7675; color:white; border:none; padding:4px 10px; border-radius:6px; cursor:pointer; font-size:12px;"><i class="fas fa-user-slash"></i> ลบ</button>
                        </div>
                    `;
                }
            });
        }
        if(!hasUsers) {
            adminUserList.innerHTML = '<p style="color:#777; text-align:center;">ยังไม่มีนักเรียนในระบบ</p>';
        }
    });
}

// --- ฟังก์ชันเมื่อแอดมินกดเข้าไปดูในห้อง (หน้าจัดการเพลง) ---
window.viewRoomAdmin = (roomId) => {
    document.getElementById('adminDetailRoomName').innerText = `ห้อง: ${displayRoom(roomId)}`;
    window.switchView('adminRoomDetailsView');
    
    const songsRef = ref(db, `songs/${roomId}`);
    onValue(songsRef, (snapshot) => {
        if(document.getElementById('adminRoomDetailsView').classList.contains('active')) {
            const adminSongListDiv = document.getElementById('adminRoomSongList');
            adminSongListDiv.innerHTML = '';
            
            if (snapshot.exists()) {
                const songs = [];
                snapshot.forEach(child => { songs.push({ id: child.key, ...child.val() }); });
                songs.sort((a, b) => b.votes - a.votes);

                songs.forEach(song => {
                    const searchQuery = `${song.title} ${song.artist}`;
                    adminSongListDiv.innerHTML += `
                        <div class="song-item">
                            <div class="song-info">
                                <h4>${song.title} <span style="color:#e17055; font-size: 12px;">(โหวต: ${song.votes})</span></h4>
                                <p><i class="fas fa-microphone"></i> ${song.artist}</p>
                                <p style="font-size:10px; color:#b2bec3;">เสนอโดย: ${song.addedByName || 'นักเรียน'}</p>
                            </div>
                            <button class="btn-youtube" onclick="searchYouTube('${searchQuery}')">
                                <i class="fab fa-youtube"></i> ค้นหา
                            </button>
                        </div>
                    `;
                });
            } else {
                adminSongListDiv.innerHTML = '<p style="text-align:center; color:#333; width:100%;">ยังไม่มีคนขอเพลงในห้องนี้</p>';
            }
        }
    });
};

window.searchYouTube = (query) => {
    const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
    window.open(url, '_blank');
};
