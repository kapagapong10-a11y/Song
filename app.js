import { initializeApp } from "https://www.gstatic.com/firebasejs/10.5.0/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.5.0/firebase-auth.js";
import { getDatabase, ref, set, push, get, onValue, update, remove, runTransaction } from "https://www.gstatic.com/firebasejs/10.5.0/firebase-database.js";

// Firebase Configuration
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

// --- ฟังก์ชันช่วยเหลือ ---
function getThaiDateString() {
    return new Date().toLocaleDateString("en-US", { timeZone: "Asia/Bangkok" });
}

// ฟังก์ชันกรองชื่อห้อง ป้องกัน Error จาก Firebase (ห้ามมี . # $ [ ])
function sanitizeRoomId(name) {
    // ลบจุดและอักขระพิเศษออก และเปลี่ยน / เป็น -
    return name.replace(/[\.\#\$\[\]]/g, '').replace(/\//g, '-').trim();
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
            
            if(!fullname || !rawClassroom || !studentNo) return alert("กรุณากรอกข้อมูลส่วนตัวให้ครบถ้วน");

            // กรองชื่อห้องเพื่อป้องกัน Firebase Error
            const classroom = sanitizeRoomId(rawClassroom);

            const userCredential = await createUserWithEmailAndPassword(auth, email, password);
            await set(ref(db, 'users/' + userCredential.user.uid), {
                fullname: fullname,
                classroom: classroom,
                studentNo: parseInt(studentNo),
                role: 'user'
            });
            alert('สมัครสมาชิกสำเร็จ!');
            // ล้างฟอร์ม
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
                    window.switchView('adminView');
                    loadAdminData();
                } else {
                    window.switchView('studentView');
                    currentRoomId = currentUserData.classroom;
                    // แสดงผลแบบเอา - กลับมาเป็น /
                    document.getElementById('studentRoomName').innerText = `ห้อง: ${currentRoomId.replace('-', '/')}`;
                    loadStudentRoom();
                }
            } else {
                if(user.email === 'admin@admin.com'){
                     set(ref(db, 'users/' + user.uid), { role: 'admin', fullname: 'Administrator' });
                     window.switchView('adminView');
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
    }, (error) => { console.error(error); });
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
            songListDiv.innerHTML = '<p style="text-align:center; color:#fff; width:100%;">ยังไม่มีคนขอเพลงเลย แอดเพลงแรกเลย!</p>';
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
    }).catch(err => console.error("Vote failed:", err));
};

// --- Admin Logic ---
window.createRoom = () => {
    let rawRoomName = document.getElementById('newRoomName').value;
    if(!rawRoomName) return alert("กรุณากรอกชื่อห้องเรียนก่อนกดสร้าง");
    
    // กรองชื่อห้องป้องกัน Error
    const roomName = sanitizeRoomId(rawRoomName); 
    
    set(ref(db, `rooms/${roomName}`), {
        createdAt: Date.now(),
        lastReset: getThaiDateString()
    }).then(() => {
        alert(`เปิดใช้งานห้อง ${rawRoomName} เรียบร้อยแล้ว`);
        document.getElementById('newRoomName').value = '';
    }).catch((error) => {
        alert("สร้างห้องไม่สำเร็จ: " + error.message);
    });
};

window.deleteRoom = (roomName) => {
    if(confirm(`ลบห้อง "${roomName.replace('-', '/')}" และประวัติเพลงทั้งหมด?`)) {
        remove(ref(db, `rooms/${roomName}`))
            .then(() => remove(ref(db, `songs/${roomName}`)))
            .catch(err => alert("ลบไม่สำเร็จ: " + err.message));
    }
};

window.deleteUser = (uid) => {
    if(confirm('ต้องการลบข้อมูลนักเรียนคนนี้ใช่หรือไม่?')) {
        remove(ref(db, `users/${uid}`))
            .catch(err => alert("ลบไม่สำเร็จ: " + err.message));
    }
};

function loadAdminData() {
    onValue(ref(db, 'rooms'), (snapshot) => {
        const adminRoomList = document.getElementById('adminRoomList');
        adminRoomList.innerHTML = '';
        if (snapshot.exists()) {
            snapshot.forEach(child => {
                adminRoomList.innerHTML += `
                    <div style="display:flex; justify-content:space-between; align-items:center; padding: 8px 5px; border-bottom: 1px solid #eee;">
                        <span style="color:#2d3436; font-weight:500;">ห้อง: ${child.key.replace('-', '/')}</span>
                        <button onclick="deleteRoom('${child.key}')" style="background:#ff7675; color:white; border:none; padding:4px 10px; border-radius:6px; cursor:pointer; font-size:12px;"><i class="fas fa-trash"></i> ลบห้อง</button>
                    </div>
                `;
            });
        } else {
            adminRoomList.innerHTML = '<p style="color:#777; text-align:center;">ยังไม่มีการสร้างห้อง</p>';
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
                            <span style="color:#2d3436; font-size:14px;">${user.fullname} (${user.classroom ? user.classroom.replace('-','/') : ''})</span>
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
