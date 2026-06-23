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
let isSigningUp = false; // ตัวแปรป้องกัน Race Condition ตอนสมัครสมาชิก

// ==========================================
// 🎨 ระบบ Custom Alert & Confirm สวยงาม
// ==========================================
window.showAlert = (message, type = 'info') => {
    const overlay = document.getElementById('customAlert');
    const title = document.getElementById('alertTitle');
    const icon = document.getElementById('alertIcon');
    const cancelBtn = document.getElementById('alertCancelBtn');
    
    document.getElementById('alertMessage').innerText = message;
    document.getElementById('alertOkBtn').innerText = 'ตกลง';
    cancelBtn.style.display = 'none';

    if(type === 'success') {
        title.innerText = "สำเร็จ!";
        icon.innerHTML = '<i class="fas fa-check-circle"></i>';
        icon.className = 'custom-alert-icon success';
    } else if (type === 'error') {
        title.innerText = "ข้อผิดพลาด!";
        icon.innerHTML = '<i class="fas fa-times-circle"></i>';
        icon.className = 'custom-alert-icon error';
    } else {
        title.innerText = "แจ้งเตือน";
        icon.innerHTML = '<i class="fas fa-info-circle"></i>';
        icon.className = 'custom-alert-icon info';
    }

    overlay.classList.add('show');
    document.getElementById('alertOkBtn').onclick = () => overlay.classList.remove('show');
};

window.showConfirm = (message) => {
    return new Promise((resolve) => {
        const overlay = document.getElementById('customAlert');
        const title = document.getElementById('alertTitle');
        const icon = document.getElementById('alertIcon');
        const okBtn = document.getElementById('alertOkBtn');
        const cancelBtn = document.getElementById('alertCancelBtn');

        title.innerText = "ยืนยันการทำรายการ";
        document.getElementById('alertMessage').innerText = message;
        icon.innerHTML = '<i class="fas fa-exclamation-triangle"></i>';
        icon.className = 'custom-alert-icon warning';
        
        okBtn.innerText = 'ยืนยัน';
        cancelBtn.style.display = 'block';
        overlay.classList.add('show');

        okBtn.onclick = () => { overlay.classList.remove('show'); resolve(true); };
        cancelBtn.onclick = () => { overlay.classList.remove('show'); resolve(false); };
    });
};

// ==========================================
// 🧠 SMART PARSER
// ==========================================
function formatDbRoom(input) {
    if (!input) return "";
    const match = input.match(/(\d+).*?(\d+)/);
    if (match) return `${match[1]}-${match[2]}`;
    const singleMatch = input.match(/(\d+)/);
    if (singleMatch) return `${singleMatch[1]}`;
    return input.trim();
}

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
    
    if(!email || !password) return showAlert("กรุณากรอกอีเมลและรหัสผ่าน", "error");

    try {
        if (isLoginMode) {
            await signInWithEmailAndPassword(auth, email, password);
        } else {
            const fullname = document.getElementById('fullname').value;
            const rawClassroom = document.getElementById('classroom').value; 
            const studentNo = document.getElementById('studentNo').value;
            
            if(!fullname || !rawClassroom || !studentNo) return showAlert("กรุณากรอกข้อมูลให้ครบถ้วน", "error");

            const classroom = formatDbRoom(rawClassroom);
            if(!classroom) return showAlert("รูปแบบชั้นเรียนไม่ถูกต้อง", "error");

            // ล็อก Observer เพื่อป้องกันมันเช็คข้อมูลก่อนเขียน DB เสร็จ
            isSigningUp = true; 
            
            const userCredential = await createUserWithEmailAndPassword(auth, email, password);
            await set(ref(db, 'users/' + userCredential.user.uid), {
                fullname: fullname,
                classroom: classroom,
                studentNo: parseInt(studentNo),
                role: 'user'
            });
            
            isSigningUp = false; // ปลดล็อก
            showAlert('สมัครสมาชิกสำเร็จ!', 'success');
            
            document.getElementById('fullname').value = '';
            document.getElementById('classroom').value = '';
            document.getElementById('studentNo').value = '';
            document.getElementById('password').value = '';
            
            // สั่งรันเช็คสิทธิ์แบบแมนนวลเพื่อพานักเรียนเข้าระบบ
            checkUserRoleAndRoute(userCredential.user);
        }
    } catch (error) {
        isSigningUp = false;
        showAlert("เกิดข้อผิดพลาด: " + error.message, "error");
    }
};

window.logout = () => { signOut(auth); };

onAuthStateChanged(auth, (user) => {
    // ถ้าระบบกำลังเขียนฐานข้อมูลสมัครสมาชิกอยู่ ให้รอเงียบๆ ไม่ต้องรีบเช็ค
    if (isSigningUp) return; 

    if (user) {
        checkUserRoleAndRoute(user);
    } else {
        window.switchView('authView');
        currentUserData = null;
    }
});

// ฟังก์ชันแยกสำหรับเช็คสิทธิ์หลังจากล็อกอินหรือสมัครสมาชิกเสร็จแล้ว
function checkUserRoleAndRoute(user) {
    get(ref(db, 'users/' + user.uid)).then((snapshot) => {
        if (snapshot.exists()) {
            currentUserData = snapshot.val();
            if (currentUserData.role === 'admin') {
                window.switchView('adminMainView');
                loadAdminData();
            } else {
                window.switchView('studentView');
                currentRoomId = currentUserData.classroom;
                document.getElementById('studentRoomName').innerText = `ห้อง: ${displayRoom(currentRoomId)}`;
                loadStudentRoom();
            }
        } else {
            if(user.email === 'admin@admin.com'){
                 set(ref(db, 'users/' + user.uid), { role: 'admin', fullname: 'Administrator' });
                 window.switchView('adminMainView');
                 loadAdminData();
            } else {
                showAlert("ไม่พบข้อมูลผู้ใช้ของคุณ กรุณาสมัครสมาชิกใหม่", "error");
                signOut(auth);
            }
        }
    }).catch(err => showAlert("สิทธิ์การเข้าถึงฐานข้อมูลล้มเหลว: " + err.message, "error"));
}

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
    if(!title || !artist) return showAlert("กรุณากรอกข้อมูลเพลงให้ครบถ้วน", "error");

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
        showAlert("ขอเพลงไม่สำเร็จ: " + error.message, "error");
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
                showAlert("คุณโหวตเพลงนี้ไปแล้ว!", "warning");
            }
        }
        return song;
    });
};

// --- Admin Logic ---
window.createRoom = () => {
    let rawRoomName = document.getElementById('newRoomName').value;
    if(!rawRoomName) return showAlert("กรุณากรอกชั้นเรียน", "error");
    
    const roomName = formatDbRoom(rawRoomName); 
    if(!roomName) return showAlert("รูปแบบไม่ถูกต้อง", "error");
    
    set(ref(db, `rooms/${roomName}`), {
        createdAt: Date.now(),
        lastReset: getThaiDateString()
    }).then(() => {
        showAlert(`เปิดใช้งานห้อง ${displayRoom(roomName)} เรียบร้อยแล้ว`, "success");
        document.getElementById('newRoomName').value = '';
    });
};

// ใช้ async/await สำหรับการรอผู้ใช้กดยืนยันใน Custom Popup
window.deleteRoom = async (roomName) => {
    const isConfirmed = await showConfirm(`ยืนยันการลบห้อง "${displayRoom(roomName)}" และประวัติเพลงทั้งหมด?`);
    if(isConfirmed) {
        remove(ref(db, `rooms/${roomName}`))
            .then(() => remove(ref(db, `songs/${roomName}`)))
            .then(() => showAlert("ลบห้องสำเร็จ", "success"))
            .catch(err => showAlert("ลบไม่สำเร็จ: " + err.message, "error"));
    }
};

window.deleteUser = async (uid) => {
    const isConfirmed = await showConfirm('ต้องการลบข้อมูลนักเรียนคนนี้ใช่หรือไม่?');
    if(isConfirmed) {
        remove(ref(db, `users/${uid}`))
            .then(() => showAlert("ลบข้อมูลสำเร็จ", "success"))
            .catch(err => showAlert("ลบไม่สำเร็จ: " + err.message, "error"));
    }
};

function loadAdminData() {
    onValue(ref(db, 'rooms'), (snapshot) => {
        const adminRoomGrid = document.getElementById('adminRoomGrid');
        const adminRoomListSystem = document.getElementById('adminRoomListSystem');
        
        adminRoomGrid.innerHTML = '';
        adminRoomListSystem.innerHTML = '';

        if (snapshot.exists()) {
            snapshot.forEach(child => {
                const roomDisplay = displayRoom(child.key);
                
                adminRoomGrid.innerHTML += `
                    <div class="room-card" onclick="viewRoomAdmin('${child.key}')">
                        <i class="fas fa-door-open" style="font-size: 24px; margin-bottom: 5px;"></i>
                        <h4>${roomDisplay}</h4>
                    </div>
                `;

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
